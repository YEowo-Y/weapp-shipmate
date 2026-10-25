use glib::{prelude::*, Variant};

fn strings(values: &[&str]) -> Variant {
    Variant::array_from_iter::<String>(values.iter().map(|value| (*value).to_variant()))
}

// These exercise the real GLib FFI. Run in release mode as well as debug:
// RUSTSEC-2024-0429 can be exposed by optimizing writes through immutable pointers.
#[test]
fn next_preserves_empty_and_multibyte_strings() {
    let variant = strings(&["", "中文", "🚢", "tail"]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next(), Some(""));
    assert_eq!(iter.next(), Some("中文"));
    assert_eq!(iter.next(), Some("🚢"));
    assert_eq!(iter.next(), Some("tail"));
    assert_eq!(iter.next(), None);
}

#[test]
fn next_back_preserves_strings_in_reverse_order() {
    let variant = strings(&["", "中文", "🚢"]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next_back(), Some("🚢"));
    assert_eq!(iter.next_back(), Some("中文"));
    assert_eq!(iter.next_back(), Some(""));
    assert_eq!(iter.next_back(), None);
}

#[test]
fn nth_skips_relative_to_the_current_front() {
    let variant = strings(&["skip", "中文", "skip", "🚢", ""]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.nth(1), Some("中文"));
    assert_eq!(iter.nth(1), Some("🚢"));
    assert_eq!(iter.nth(0), Some(""));
    assert_eq!(iter.nth(0), None);
}

#[test]
fn nth_back_skips_relative_to_the_current_back() {
    let variant = strings(&["", "🚢", "skip", "中文", "skip"]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.nth_back(1), Some("中文"));
    assert_eq!(iter.nth_back(1), Some("🚢"));
    assert_eq!(iter.nth_back(0), Some(""));
    assert_eq!(iter.nth_back(0), None);
}

#[test]
fn last_returns_the_last_remaining_string() {
    let variant = strings(&["first", "", "中文", "🚢"]);
    assert_eq!(variant.array_iter_str().unwrap().last(), Some("🚢"));
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next(), Some("first"));
    assert_eq!(iter.next_back(), Some("🚢"));
    assert_eq!(iter.last(), Some("中文"));
    assert_eq!(strings(&[""]).array_iter_str().unwrap().last(), Some(""));
}

#[test]
fn mixed_direction_iteration_tracks_remaining_length_and_stays_exhausted() {
    let variant = strings(&["front", "", "中文", "🚢", "middle", "back"]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.len(), 6);
    assert_eq!(iter.size_hint(), (6, Some(6)));
    assert_eq!(iter.next(), Some("front"));
    assert_eq!(iter.next_back(), Some("back"));
    assert_eq!(iter.len(), 4);
    assert_eq!(iter.nth(1), Some("中文"));
    assert_eq!(iter.len(), 2);
    assert_eq!(iter.nth_back(0), Some("middle"));
    assert_eq!(iter.size_hint(), (1, Some(1)));
    assert_eq!(iter.next(), Some("🚢"));
    assert_eq!(iter.len(), 0);
    assert_eq!(iter.size_hint(), (0, Some(0)));
    assert_eq!(iter.next_back(), None);
    assert_eq!(iter.next(), None);
    assert_eq!(iter.nth(0), None);
    assert_eq!(iter.nth_back(0), None);
    assert_eq!(iter.last(), None);
}

#[test]
fn empty_string_array_has_no_items_in_either_direction() {
    let variant = strings(&[]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.len(), 0);
    assert_eq!(iter.size_hint(), (0, Some(0)));
    assert_eq!(iter.next(), None);
    assert_eq!(iter.next_back(), None);
    assert_eq!(iter.last(), None);
}

#[test]
fn non_string_arrays_and_scalars_are_rejected() {
    let integers = Variant::array_from_iter::<u32>([1_u32.to_variant(), 2_u32.to_variant()]);
    assert!(integers.array_iter_str().is_err());
    assert!("a scalar string".to_variant().array_iter_str().is_err());
    assert!(42_u32.to_variant().array_iter_str().is_err());
}

#[test]
fn overflowing_forward_skip_exhausts_without_wrapping_to_an_item() {
    let variant = strings(&["first", "中文", "🚢"]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next(), Some("first"));
    assert_eq!(iter.nth(usize::MAX), None);
    assert_eq!(iter.len(), 0);
    assert_eq!(iter.next(), None);
    assert_eq!(iter.next_back(), None);
}

#[test]
fn overflowing_backward_skip_exhausts_without_wrapping_to_an_item() {
    let variant = strings(&["first", "中文", "🚢"]);
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next_back(), Some("🚢"));
    assert_eq!(iter.nth_back(usize::MAX), None);
    assert_eq!(iter.len(), 0);
    assert_eq!(iter.next_back(), None);
    assert_eq!(iter.next(), None);
}
