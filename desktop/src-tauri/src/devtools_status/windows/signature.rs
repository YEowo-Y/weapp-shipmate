#[path = "pe_version.rs"]
mod pe_version;

use super::{expected_file, hold_directories, invalid_path};
use std::{
    fs::File,
    io,
    mem::size_of,
    os::windows::{ffi::OsStrExt, io::AsRawHandle},
    path::Path,
};
use windows_sys::Win32::{
    Foundation::{HANDLE, INVALID_HANDLE_VALUE},
    Security::{
        Cryptography::{
            szOID_COMMON_NAME, szOID_ORGANIZATION_NAME, CertGetNameStringW, CERT_NAME_ATTR_TYPE,
        },
        WinTrust::{
            WTHelperGetProvCertFromChain, WTHelperGetProvSignerFromChain,
            WTHelperProvDataFromStateData, WinVerifyTrust, WINTRUST_ACTION_GENERIC_VERIFY_V2,
            WINTRUST_DATA, WINTRUST_DATA_0, WINTRUST_FILE_INFO, WTD_CACHE_ONLY_URL_RETRIEVAL,
            WTD_CHOICE_FILE, WTD_DISABLE_MD2_MD4, WTD_REVOCATION_CHECK_NONE, WTD_REVOKE_NONE,
            WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE,
        },
    },
};

const TENCENT_PUBLISHER: &str = "Tencent Technology (Shenzhen) Company Limited";
const DEVTOOLS_PRODUCT: &str = "微信开发者工具";
const MAX_EXECUTABLE_BYTES: u64 = 512 * 1024 * 1024;

pub(super) struct PinnedImage {
    _file: File,
    _directories: Vec<File>,
}

pub(super) fn pin_trusted_image(path: &Path) -> io::Result<PinnedImage> {
    let directories = hold_directories(path.parent().ok_or_else(invalid_path)?)?;
    let file = expected_file(path, true)?;
    if file.metadata()?.len() > MAX_EXECUTABLE_BYTES {
        return Err(invalid_path());
    }
    let name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    verify_signature(&name, &file)?;
    if !embedded_product_matches(&pe_version::embedded_version_resource(&file)?) {
        return Err(invalid_path());
    }
    Ok(PinnedImage {
        _file: file,
        _directories: directories,
    })
}

fn verify_signature(path: &[u16], file: &File) -> io::Result<()> {
    let mut subject = WINTRUST_FILE_INFO {
        cbStruct: size_of::<WINTRUST_FILE_INFO>() as u32,
        pcwszFilePath: path.as_ptr(),
        hFile: file.as_raw_handle(),
        ..Default::default()
    };
    let mut data = WINTRUST_DATA {
        cbStruct: size_of::<WINTRUST_DATA>() as u32,
        dwUIChoice: WTD_UI_NONE,
        fdwRevocationChecks: WTD_REVOKE_NONE,
        dwUnionChoice: WTD_CHOICE_FILE,
        Anonymous: WINTRUST_DATA_0 {
            pFile: &mut subject,
        },
        dwStateAction: WTD_STATEACTION_VERIFY,
        dwProvFlags: WTD_CACHE_ONLY_URL_RETRIEVAL | WTD_REVOCATION_CHECK_NONE | WTD_DISABLE_MD2_MD4,
        ..Default::default()
    };
    let mut policy = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    // Both the path and the open executable handle remain valid through verification and close.
    // The provider uses Windows' local trust store and cannot fetch certificate URLs or show UI.
    let result = unsafe {
        WinVerifyTrust(
            INVALID_HANDLE_VALUE,
            &mut policy,
            std::ptr::from_mut(&mut data).cast(),
        )
    };
    let matches = result == 0 && verified_publisher_matches(data.hWVTStateData);
    data.dwStateAction = WTD_STATEACTION_CLOSE;
    unsafe {
        WinVerifyTrust(
            INVALID_HANDLE_VALUE,
            &mut policy,
            std::ptr::from_mut(&mut data).cast(),
        )
    };
    if result != 0 {
        return Err(io::Error::from_raw_os_error(result));
    }
    if !matches {
        return Err(invalid_path());
    }
    Ok(())
}

fn verified_publisher_matches(state: HANDLE) -> bool {
    if state.is_null() {
        return false;
    }
    // The leaf of the successfully verified primary signature is borrowed until state close.
    let provider = unsafe { WTHelperProvDataFromStateData(state) };
    if provider.is_null() {
        return false;
    }
    let signer = unsafe { WTHelperGetProvSignerFromChain(provider, 0, 0, 0) };
    if signer.is_null() {
        return false;
    }
    let leaf = unsafe { WTHelperGetProvCertFromChain(signer, 0).as_ref() };
    let Some(leaf) = leaf.filter(|leaf| !leaf.pCert.is_null()) else {
        return false;
    };

    let expected = super::wide(TENCENT_PUBLISHER);
    [szOID_ORGANIZATION_NAME, szOID_COMMON_NAME]
        .into_iter()
        .all(|attribute| {
            let mut name = [0u16; 256];
            let len = unsafe {
                CertGetNameStringW(
                    leaf.pCert,
                    CERT_NAME_ATTR_TYPE,
                    0,
                    attribute.cast(),
                    name.as_mut_ptr(),
                    name.len() as u32,
                )
            };
            name.get(..len as usize) == Some(expected.as_slice())
        })
}

struct VersionBlock<'a> {
    key: &'a [u8],
    value: &'a [u8],
    children: &'a [u8],
    text: bool,
}

impl<'a> VersionBlock<'a> {
    fn parse(bytes: &'a [u8], value_unit_bytes: usize) -> Option<(Self, usize)> {
        let [length_low, length_high, value_low, value_high, kind, 0] =
            *bytes.first_chunk::<6>()?
        else {
            return None;
        };
        if kind > 1 {
            return None;
        }
        let length = usize::from(u16::from_le_bytes([length_low, length_high]));
        let block = bytes.get(..length)?;
        let key_bytes = block
            .get(6..)?
            .chunks_exact(2)
            .position(|pair| pair == [0, 0])?
            * 2;
        let key_end = 6 + key_bytes;
        let value_start = (key_end + 2).next_multiple_of(4);
        let value_bytes =
            usize::from(u16::from_le_bytes([value_low, value_high])) * value_unit_bytes;
        let value_end = value_start + value_bytes;
        Some((
            Self {
                key: block.get(6..key_end)?,
                value: block.get(value_start..value_end)?,
                children: block
                    .get(value_end.next_multiple_of(4)..)
                    .unwrap_or_default(),
                text: kind == 1,
            },
            length,
        ))
    }

    fn key_is(&self, expected: &str) -> bool {
        utf16_units(self.key).eq(expected.encode_utf16())
    }
}

fn utf16_units(bytes: &[u8]) -> impl Iterator<Item = u16> + '_ {
    bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
}

fn string_blocks(mut bytes: &[u8]) -> impl Iterator<Item = VersionBlock<'_>> {
    std::iter::from_fn(move || {
        let (block, length) = VersionBlock::parse(bytes, 2)?;
        bytes = bytes.get(length.next_multiple_of(4)..).unwrap_or_default();
        Some(block)
    })
}

fn embedded_product_matches(bytes: &[u8]) -> bool {
    // VS_VERSIONINFO's binary value length is in bytes. String values are in UTF-16 words.
    let Some((root, _)) = VersionBlock::parse(bytes, 1) else {
        return false;
    };
    !root.text
        && root.key_is("VS_VERSION_INFO")
        && string_blocks(root.children)
            .filter(|block| block.key_is("StringFileInfo") && block.value.is_empty())
            .flat_map(|block| string_blocks(block.children))
            .filter(|table| {
                table.value.is_empty()
                    && table.key.len() == 16
                    && table
                        .key
                        .chunks_exact(2)
                        .all(|pair| pair[1] == 0 && pair[0].is_ascii_hexdigit())
            })
            .flat_map(|table| string_blocks(table.children))
            .any(|entry| {
                entry.text
                    && entry.key_is("ProductName")
                    && utf16_units(entry.value).eq(DEVTOOLS_PRODUCT.encode_utf16().chain(Some(0)))
            })
}

#[cfg(test)]
mod tests {
    use super::{embedded_product_matches, DEVTOOLS_PRODUCT};

    fn version_block(key: &str, value: &[u8], text: bool, child: &[u8]) -> Vec<u8> {
        let mut result = vec![0; 6];
        let value_units = (value.len() / if text { 2 } else { 1 }) as u16;
        result[2..4].copy_from_slice(&value_units.to_le_bytes());
        result[4] = u8::from(text);
        result.extend(key.encode_utf16().chain(Some(0)).flat_map(u16::to_le_bytes));
        result.resize(result.len().next_multiple_of(4), 0);
        result.extend(value);
        if !child.is_empty() {
            result.resize(result.len().next_multiple_of(4), 0);
            result.extend(child);
        }
        let length = result.len() as u16;
        result[..2].copy_from_slice(&length.to_le_bytes());
        result
    }

    fn product_resource(folder: &str, product: &str) -> Vec<u8> {
        let value: Vec<u8> = product
            .encode_utf16()
            .chain(Some(0))
            .flat_map(u16::to_le_bytes)
            .collect();
        let product = version_block("ProductName", &value, true, &[]);
        let table = version_block("040904b0", &[], true, &product);
        let folder = version_block(folder, &[], true, &table);
        version_block("VS_VERSION_INFO", &[0; 52], false, &folder)
    }

    #[test]
    fn requires_the_exact_product_at_its_version_resource_path() {
        let valid = product_resource("StringFileInfo", DEVTOOLS_PRODUCT);
        assert!(embedded_product_matches(&valid));
        assert!(!embedded_product_matches(&valid[..valid.len() - 1]));
        assert!(!embedded_product_matches(&product_resource(
            "VarFileInfo",
            DEVTOOLS_PRODUCT
        )));
        assert!(!embedded_product_matches(&product_resource(
            "StringFileInfo",
            "微信开发者工具（夹具）"
        )));
    }
}
