//! Vector maths for embeddings. Vectors are normalised, so cosine similarity is a dot product.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

/// Scales a vector to length 1 (an all-zero vector stays zero).
pub fn normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

/// Dot product. Mismatched lengths give 0.
pub fn dot(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Little-endian bytes of a vector.
pub fn to_blob(v: &[f32]) -> Vec<u8> {
    v.iter().flat_map(|x| x.to_le_bytes()).collect()
}

/// Vector from little-endian bytes. `None` when the length is not a multiple of 4.
pub fn from_blob(b: &[u8]) -> Option<Vec<f32>> {
    if !b.len().is_multiple_of(4) {
        return None;
    }
    Some(
        b.as_chunks::<4>()
            .0
            .iter()
            .map(|c| f32::from_le_bytes(*c))
            .collect(),
    )
}

/// Min-heap entry ordered by score (`total_cmp`, so NaN cannot panic).
#[derive(PartialEq)]
struct Scored(f32, usize);

impl Eq for Scored {}

impl PartialOrd for Scored {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Scored {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reversed, so the heap keeps the *lowest* score on top and can be trimmed.
        other.0.total_cmp(&self.0)
    }
}

/// The `k` best `(index, score)` pairs, highest score first.
pub fn top_k(scores: impl Iterator<Item = (usize, f32)>, k: usize) -> Vec<(usize, f32)> {
    let mut heap: BinaryHeap<Scored> = BinaryHeap::new();
    // Non-finite scores (NaN from a broken vector) are never a match.
    for (idx, score) in scores.filter(|(_, s)| s.is_finite()) {
        if heap.len() < k {
            heap.push(Scored(score, idx));
        } else if heap
            .peek()
            .is_some_and(|worst| score.total_cmp(&worst.0) == Ordering::Greater)
        {
            heap.pop();
            heap.push(Scored(score, idx));
        }
    }
    let mut out: Vec<(usize, f32)> = heap.into_iter().map(|Scored(s, i)| (i, s)).collect();
    out.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalised_vectors_have_unit_self_similarity() {
        let mut v = vec![3.0, 4.0];
        normalize(&mut v);
        assert!((dot(&v, &v) - 1.0).abs() < 1e-6);
        let mut zero = vec![0.0, 0.0];
        normalize(&mut zero);
        assert_eq!(zero, vec![0.0, 0.0]);
    }

    #[test]
    fn blob_round_trip_and_bad_lengths() {
        let v = vec![0.5f32, -1.25, 3.0];
        assert_eq!(from_blob(&to_blob(&v)), Some(v));
        assert_eq!(from_blob(&[1, 2, 3]), None);
    }

    #[test]
    fn top_k_orders_and_limits() {
        let scores = vec![
            (0usize, 0.1f32),
            (1, 0.9),
            (2, 0.5),
            (3, f32::NAN),
            (4, 0.7),
        ];
        let best = top_k(scores.into_iter(), 3);
        assert_eq!(
            best.iter()
                .map(|(i, _)| *i)
                .filter(|i| *i != 3)
                .collect::<Vec<_>>(),
            vec![1, 4, 2]
        );
        assert_eq!(top_k(vec![(0usize, 1.0f32)].into_iter(), 5).len(), 1);
    }
}
