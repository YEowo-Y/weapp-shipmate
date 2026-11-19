use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
};

const DIRECTORY_FLAG: u32 = 1 << 31;
const MAX_VERSION_BYTES: u32 = 64 * 1024;

pub(super) fn embedded_version_resource(mut file: &File) -> io::Result<Vec<u8>> {
    read_version_resource(&mut file)
}

fn read_version_resource(image: &mut (impl Read + Seek)) -> io::Result<Vec<u8>> {
    // PE offsets below refer only to this pinned executable. Resource lookup never
    // loads the image or consults a neighboring language resource file.
    let dos = read_at::<64>(image, 0)?;
    if !dos.starts_with(b"MZ") {
        return Err(invalid_pe());
    }
    let pe = read_at::<24>(image, u64::from(dword(&dos, 60)))?;
    let section_count = usize::from(word(&pe, 6));
    let optional_size = usize::from(word(&pe, 20));
    if !pe.starts_with(b"PE\0\0") || !(1..=96).contains(&section_count) || optional_size > 4096 {
        return Err(invalid_pe());
    }
    let mut optional = vec![0; optional_size];
    image.read_exact(&mut optional)?;
    let directory_start = match optional.get(..2) {
        Some([0x0b, 0x01]) => 96,  // PE32
        Some([0x0b, 0x02]) => 112, // PE32+
        _ => return Err(invalid_pe()),
    };
    let resource_directory = directory_start + 2 * 8;
    if optional.len() < resource_directory + 8 || dword(&optional, directory_start - 4) < 3 {
        return Err(invalid_pe());
    }
    let resource_rva = dword(&optional, resource_directory);
    let resource_size = dword(&optional, resource_directory + 4);
    if resource_rva == 0 || resource_size == 0 {
        return Err(invalid_pe());
    }

    let mut sections = vec![[0; 40]; section_count];
    for section in &mut sections {
        image.read_exact(section)?;
    }
    let raw_offset = |address: u32, size: u32| {
        sections
            .iter()
            .find_map(|section| {
                let offset = address.checked_sub(dword(section, 12))?;
                (offset.checked_add(size)? <= dword(section, 16))
                    .then(|| u64::from(dword(section, 20)) + u64::from(offset))
            })
            .ok_or_else(invalid_pe)
    };
    let resource_base = raw_offset(resource_rva, resource_size)?;
    let directory_position = |offset: u32, size: u32| {
        (offset <= resource_size && size <= resource_size - offset)
            .then(|| resource_base + u64::from(offset))
            .ok_or_else(invalid_pe)
    };

    // The resource tree is type → resource ID → language, with offsets relative
    // to the resource directory. Match RT_VERSION (16) and the PE version ID (1).
    let root = resource_entries(image, &directory_position, 0)?;
    let versions = subdirectory(&root, 16)?;
    let ids = resource_entries(image, &directory_position, versions)?;
    let languages = resource_entries(image, &directory_position, subdirectory(&ids, 1)?)?;
    let data_entry = languages
        .chunks_exact(8)
        .find_map(|entry| {
            let offset = dword(entry, 4);
            (u16::try_from(dword(entry, 0)).is_ok() && offset & DIRECTORY_FLAG == 0)
                .then_some(offset)
        })
        .ok_or_else(invalid_pe)?;
    let data = read_at::<16>(image, directory_position(data_entry, 16)?)?;
    let size = dword(&data, 4);
    if size == 0 || size > MAX_VERSION_BYTES {
        return Err(invalid_pe());
    }
    image.seek(SeekFrom::Start(raw_offset(dword(&data, 0), size)?))?;
    let mut bytes = vec![0; size as usize];
    image.read_exact(&mut bytes)?;
    Ok(bytes)
}

fn resource_entries(
    image: &mut (impl Read + Seek),
    position: &impl Fn(u32, u32) -> io::Result<u64>,
    offset: u32,
) -> io::Result<Vec<u8>> {
    let header = read_at::<16>(image, position(offset, 16)?)?;
    let count = u32::from(word(&header, 12)) + u32::from(word(&header, 14));
    if count > 1024 {
        return Err(invalid_pe());
    }
    let size = count * 8;
    image.seek(SeekFrom::Start(position(offset + 16, size)?))?;
    let mut entries = vec![0; size as usize];
    image.read_exact(&mut entries)?;
    Ok(entries)
}

fn subdirectory(entries: &[u8], id: u32) -> io::Result<u32> {
    entries
        .chunks_exact(8)
        .find(|entry| dword(entry, 0) == id)
        .map(|entry| dword(entry, 4))
        .filter(|offset| offset & DIRECTORY_FLAG != 0)
        .map(|offset| offset & !DIRECTORY_FLAG)
        .ok_or_else(invalid_pe)
}

fn invalid_pe() -> io::Error {
    io::ErrorKind::InvalidData.into()
}

fn read_at<const N: usize>(image: &mut (impl Read + Seek), offset: u64) -> io::Result<[u8; N]> {
    image.seek(SeekFrom::Start(offset))?;
    let mut bytes = [0; N];
    image.read_exact(&mut bytes)?;
    Ok(bytes)
}

fn word(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

fn dword(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    const RESOURCE_FILE_OFFSET: usize = 0x400;
    const RESOURCE_RVA: u32 = 0x2000;

    fn write_word(bytes: &mut [u8], offset: usize, value: u16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
    }

    fn write_dword(bytes: &mut [u8], offset: usize, value: u32) {
        bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }

    fn fixture(is_pe32_plus: bool) -> Vec<u8> {
        let mut image = vec![0; RESOURCE_FILE_OFFSET + 0x200];
        image[..2].copy_from_slice(b"MZ");
        write_dword(&mut image, 60, 0x80);
        image[0x80..0x84].copy_from_slice(b"PE\0\0");
        write_word(&mut image, 0x86, 1);
        let optional = 0x80 + 24;
        let (magic, optional_size, directory_start) = if is_pe32_plus {
            (0x20b, 240, 112)
        } else {
            (0x10b, 224, 96)
        };
        write_word(&mut image, 0x94, optional_size);
        write_word(&mut image, optional, magic);
        write_dword(&mut image, optional + directory_start - 4, 16);
        write_dword(&mut image, optional + directory_start + 16, RESOURCE_RVA);
        write_dword(&mut image, optional + directory_start + 20, 0x200);
        let section = optional + usize::from(optional_size);
        write_dword(&mut image, section + 12, RESOURCE_RVA);
        write_dword(&mut image, section + 16, 0x200);
        write_dword(&mut image, section + 20, RESOURCE_FILE_OFFSET as u32);
        let resources = &mut image[RESOURCE_FILE_OFFSET..];
        for (directory, id, target) in [
            (0, 16, DIRECTORY_FLAG | 24),
            (24, 1, DIRECTORY_FLAG | 48),
            (48, 0x804, 72),
        ] {
            write_word(resources, directory + 14, 1);
            write_dword(resources, directory + 16, id);
            write_dword(resources, directory + 20, target);
        }
        write_dword(resources, 72, RESOURCE_RVA + 96);
        write_dword(resources, 76, 7);
        resources[96..103].copy_from_slice(b"version");
        image
    }

    #[test]
    fn extracts_the_embedded_pe32_and_pe32_plus_version() {
        for is_pe32_plus in [false, true] {
            let mut image = Cursor::new(fixture(is_pe32_plus));
            assert_eq!(read_version_resource(&mut image).unwrap(), b"version");
        }
    }

    #[test]
    fn rejects_out_of_range_directories_and_version_data() {
        for (offset, value) in [
            (20, DIRECTORY_FLAG | 0x1ff),
            (72, RESOURCE_RVA + 0x1ff),
            (76, MAX_VERSION_BYTES + 1),
        ] {
            let mut image = fixture(false);
            write_dword(&mut image, RESOURCE_FILE_OFFSET + offset, value);
            assert_eq!(
                read_version_resource(&mut Cursor::new(image))
                    .unwrap_err()
                    .kind(),
                io::ErrorKind::InvalidData
            );
        }
    }
}
