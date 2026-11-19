use super::DevtoolsState;
use std::{
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpStream},
    time::{Duration, Instant},
};

const CONNECTION_TIMEOUT: Duration = Duration::from_secs(2);
const RESPONSE_LIMIT: usize = 8 * 1024;

pub(super) fn read_login_status(
    port: u16,
    owns_peer: impl FnOnce(&TcpStream) -> bool,
) -> DevtoolsState {
    request(port, CONNECTION_TIMEOUT, owns_peer)
        .and_then(|body| login_status(&body))
        .unwrap_or(DevtoolsState::ManualCheck)
}

fn request(
    port: u16,
    timeout: Duration,
    owns_peer: impl FnOnce(&TcpStream) -> bool,
) -> Option<Vec<u8>> {
    let deadline = Instant::now() + timeout;
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    let mut stream = TcpStream::connect_timeout(&address.into(), timeout).ok()?;
    if !owns_peer(&stream) {
        return None;
    }
    stream.set_write_timeout(Some(remaining(deadline)?)).ok()?;
    write!(
        stream,
        "GET /v2/islogin HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
    )
    .ok()?;
    read_response(&mut stream, deadline)
}

fn remaining(deadline: Instant) -> Option<Duration> {
    let duration = deadline.checked_duration_since(Instant::now())?;
    (!duration.is_zero()).then_some(duration)
}

fn read_response(stream: &mut TcpStream, deadline: Instant) -> Option<Vec<u8>> {
    let mut response = Vec::new();
    let mut frame: Option<(usize, Option<usize>)> = None;
    let mut chunk = [0; 1024];
    loop {
        if let Some((start, Some(length))) = frame {
            let end = start.checked_add(length)?;
            if end > RESPONSE_LIMIT || response.len() > end {
                return None;
            }
            if response.len() == end {
                return Some(response.split_off(start));
            }
        }
        stream.set_read_timeout(Some(remaining(deadline)?)).ok()?;
        let size = stream.read(&mut chunk).ok()?;
        if size == 0 {
            let (start, declared_length) = frame?;
            return declared_length.is_none().then(|| response.split_off(start));
        }
        if response.len() + size > RESPONSE_LIMIT {
            return None;
        }
        response.extend_from_slice(&chunk[..size]);
        if frame.is_none() {
            if let Some(end) = response.windows(4).position(|part| part == b"\r\n\r\n") {
                frame = Some((end + 4, content_length(&response[..end])?));
            }
        }
    }
}

fn content_length(headers: &[u8]) -> Option<Option<usize>> {
    let mut lines = std::str::from_utf8(headers).ok()?.split("\r\n");
    let mut status = lines.next()?.splitn(3, ' ');
    if !matches!(status.next(), Some("HTTP/1.0" | "HTTP/1.1")) || status.next() != Some("200") {
        return None;
    }
    if !valid_field_value(status.next().unwrap_or_default()) {
        return None;
    }
    let mut length = None;
    for line in lines {
        let (name, value) = line.split_once(':')?;
        if name.is_empty()
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte))
            || !valid_field_value(value)
            || name.eq_ignore_ascii_case("www-authenticate")
            || name.eq_ignore_ascii_case("transfer-encoding")
            || name.eq_ignore_ascii_case("content-encoding")
        {
            return None;
        }
        if name.eq_ignore_ascii_case("content-length") {
            let digits = value.trim_matches([' ', '\t']);
            if length.is_some()
                || digits.is_empty()
                || !digits.bytes().all(|byte| byte.is_ascii_digit())
            {
                return None;
            }
            length = Some(digits.parse().ok()?);
        }
    }
    Some(length)
}

fn valid_field_value(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte == b'\t' || !byte.is_ascii_control())
}

fn login_status(body: &[u8]) -> Option<DevtoolsState> {
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Login {
        login: bool,
    }
    if body
        .iter()
        .copied()
        .find(|byte| !byte.is_ascii_whitespace())
        != Some(b'{')
    {
        return None;
    }
    let login = serde_json::from_slice::<Login>(body).ok()?.login;
    Some(if login {
        DevtoolsState::Ready
    } else {
        DevtoolsState::SignedOut
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader},
        net::TcpListener,
        thread,
    };

    fn server(response: Vec<u8>) -> (u16, thread::JoinHandle<String>) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut reader = BufReader::new(&mut socket);
            let mut request = String::new();
            while reader.read_line(&mut request).unwrap() != 0 && !request.ends_with("\r\n\r\n") {}
            if !request.is_empty() {
                let _ = socket.write_all(&response);
            }
            request
        });
        (port, server)
    }

    fn json(body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    #[test]
    fn sends_only_the_fixed_local_get_after_ownership_verification() {
        let (port, server) = server(json(r#"{"login":false}"#));
        let status = read_login_status(port, |socket| {
            socket.peer_addr().ok() == Some(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into())
        });
        assert_eq!(status, DevtoolsState::SignedOut);
        assert_eq!(
            server.join().unwrap(),
            format!(
                "GET /v2/islogin HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
            )
        );
    }

    #[test]
    fn changed_or_unverified_owner_receives_no_http_bytes() {
        let (port, server) = server(json(r#"{"login":true}"#));
        assert_eq!(
            read_login_status(port, |_| false),
            DevtoolsState::ManualCheck
        );
        assert!(server.join().unwrap().is_empty());
    }

    #[test]
    fn requires_an_unambiguous_login_object() {
        for (input, expected) in [
            (r#"{"login":true}"#, DevtoolsState::Ready),
            (r#"{"login":false}"#, DevtoolsState::SignedOut),
        ] {
            let (port, server) = server(json(input));
            assert_eq!(read_login_status(port, |_| true), expected);
            server.join().unwrap();
        }
        for input in [
            r#"{"login":"false"}"#,
            r#"{"other":true}"#,
            r#"{"login":true,"login":false}"#,
            r#"{"login":true,"code":-1}"#,
            r#"{"login":false,"other":"synthetic marker"}"#,
            "[true]",
            "false",
            "broken",
        ] {
            assert_eq!(login_status(input.as_bytes()), None);
        }
    }

    #[test]
    fn rejects_auth_errors_redirects_and_unexpected_framing() {
        for head in [
            "HTTP/1.1 401 Unauthorized",
            "HTTP/1.1 403 Forbidden",
            "HTTP/1.1 302 Moved\r\nLocation: http://localhost/",
            "HTTP/1.1 200 OK\r\nWWW-Authenticate: Bearer",
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked",
            "HTTP/1.1 200 OK\r\nContent-Encoding: gzip",
            "HTTP/1.1 200 OK\r\nTransfer-Encoding : chunked",
            "HTTP/1.1 200 OK\r\nContent-Length: +14",
            "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Length : 0",
            "HTTP/1.1 200 OK\r\nX-Invalid: value\nContent-Length: 0",
            "HTTP/1.1 200 OK\r\nContent-Length: 1",
            "HTTP/1.1 200 OK\r\nContent-Length: 100",
            "HTTP/1.1 200 OK\r\nContent-Length: 8192",
            "HTTP/1.1 200 OK\r\nContent-Length: 14\r\nContent-Length: 14",
        ] {
            let (port, server) = server(format!("{head}\r\n\r\n{{\"login\":true}}").into_bytes());
            assert_eq!(
                read_login_status(port, |_| true),
                DevtoolsState::ManualCheck,
                "{head}"
            );
            assert!(server.join().unwrap().starts_with("GET /v2/islogin "));
        }
    }

    #[test]
    fn caps_close_delimited_and_unterminated_responses() {
        let mut oversized = b"HTTP/1.0 200 OK\r\n\r\n".to_vec();
        oversized.resize(RESPONSE_LIMIT + 1, b' ');
        for response in [oversized, vec![b' '; RESPONSE_LIMIT + 1]] {
            let (port, server) = server(response);
            assert_eq!(
                read_login_status(port, |_| true),
                DevtoolsState::ManualCheck
            );
            server.join().unwrap();
        }
    }

    #[test]
    fn response_deadline_expires_even_when_the_peer_keeps_the_connection_open() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let (release, wait) = std::sync::mpsc::channel();
        let server = thread::spawn(move || {
            let (_socket, _) = listener.accept().unwrap();
            wait.recv_timeout(Duration::from_secs(3)).unwrap();
        });
        let result = request(port, Duration::from_millis(100), |_| true);
        release.send(()).unwrap();
        server.join().unwrap();
        assert!(result.is_none());
    }
}
