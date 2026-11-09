//! The demo vault: a small example vault (notes, an epic with tasks, two meetings) that a new
//! person can look around in. The notes are the files in `src-tauri/demo-vault/`, embedded in the
//! program; a date written as `{{today}}`, `{{tomorrow}}` or `{{days_ago:N}}` is filled in, so the
//! meetings are always today and tomorrow. The same files feed the screenshots in `scripts/e2e/`.

use super::fs_ops;
use crate::error::{AppError, AppResult};
use chrono::{Duration, NaiveDate};
use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

/// The name of the folder the demo vault is made in.
pub const FOLDER: &str = "Mimer Demo";

/// Every note of the demo vault: where it goes in the vault, and its text with the date words.
const FILES: [(&str, &str); 6] = [
    (
        "Work/VPN rollout plan.md",
        include_str!("../../demo-vault/Work/VPN rollout plan.md"),
    ),
    (
        "Work/Support guide.md",
        include_str!("../../demo-vault/Work/Support guide.md"),
    ),
    (
        "Projects/VPN rollout.md",
        include_str!("../../demo-vault/Projects/VPN rollout.md"),
    ),
    (
        "Projects/Office move.md",
        include_str!("../../demo-vault/Projects/Office move.md"),
    ),
    (
        "Meetings/Weekly with Mette.md",
        include_str!("../../demo-vault/Meetings/Weekly with Mette.md"),
    ),
    (
        "Meetings/Budget review.md",
        include_str!("../../demo-vault/Meetings/Budget review.md"),
    ),
];

static DATE_WORD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{(today|tomorrow|days_ago:(\d+))\}\}").expect("the date word pattern is valid")
});

/// `text` with every `{{today}}`, `{{tomorrow}}` and `{{days_ago:N}}` written as `YYYY-MM-DD`.
pub fn fill_dates(text: &str, today: NaiveDate) -> String {
    DATE_WORD
        .replace_all(text, |c: &regex::Captures| {
            let days = match &c[1] {
                "today" => 0,
                "tomorrow" => 1,
                _ => -c
                    .get(2)
                    .map_or(0, |n| n.as_str().parse::<i64>().unwrap_or(0)),
            };
            (today + Duration::days(days))
                .format("%Y-%m-%d")
                .to_string()
        })
        .into_owned()
}

/// Makes the demo vault in the folder `Mimer Demo` inside `parent` and returns its path. A folder
/// with that name that is already there is returned as it is and nothing is written to it, so
/// someone's own notes are never touched.
pub fn write_demo(parent: &Path, today: NaiveDate) -> AppResult<PathBuf> {
    let dir = parent.join(FOLDER);
    if dir.exists() {
        return Ok(dir);
    }
    if !parent.is_dir() {
        return Err(AppError::InvalidPath(format!(
            "{} is not a folder",
            parent.display()
        )));
    }
    for (rel, text) in FILES {
        let abs = dir.join(rel);
        if let Some(folder) = abs.parent() {
            std::fs::create_dir_all(folder)?;
        }
        fs_ops::write_atomic(&abs, fill_dates(text, today).as_bytes())?;
    }
    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn date_words_become_dates_across_a_month_end() {
        let text = "a {{today}} b {{tomorrow}} c {{days_ago:3}} d {{days_ago:0}}";
        assert_eq!(
            fill_dates(text, day("2026-11-01")),
            "a 2026-11-01 b 2026-11-02 c 2026-10-29 d 2026-11-01"
        );
    }

    #[test]
    fn the_demo_vault_is_written_with_every_note_and_no_date_word_left() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = write_demo(tmp.path(), day("2026-11-09")).unwrap();
        assert_eq!(dir, tmp.path().join(FOLDER));
        for (rel, _) in FILES {
            let text = std::fs::read_to_string(dir.join(rel)).unwrap();
            assert!(!text.contains("{{"), "{rel} still has a date word");
        }
        let weekly = std::fs::read_to_string(dir.join("Meetings/Weekly with Mette.md")).unwrap();
        assert!(weekly.contains("meeting: 2026-11-09 10:00"));
        let budget = std::fs::read_to_string(dir.join("Meetings/Budget review.md")).unwrap();
        assert!(budget.contains("meeting: 2026-11-10 13:30"));
        // The notes are readable as what they are meant to be: an epic and two meetings.
        let epic = std::fs::read_to_string(dir.join("Projects/VPN rollout.md")).unwrap();
        assert!(epic.contains("tags: [epic]"));
        assert!(weekly.contains("tags: [meeting"));
    }

    #[test]
    fn the_epic_reads_as_four_tasks_with_steps_and_a_log() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = write_demo(tmp.path(), day("2026-11-09")).unwrap();
        let epic = std::fs::read_to_string(dir.join("Projects/VPN rollout.md")).unwrap();
        let tasks = crate::tasks::parse("Projects/VPN rollout.md", &epic);
        assert_eq!(tasks.len(), 4);
        assert_eq!(tasks[0].steps.len(), 3);
        assert_eq!(tasks[0].log.len(), 2);
        assert_eq!(tasks[0].made.as_deref(), Some("2026-11-05"));
    }

    #[test]
    fn a_folder_that_is_there_is_left_alone() {
        let tmp = tempfile::tempdir().unwrap();
        let own = tmp.path().join(FOLDER);
        std::fs::create_dir_all(&own).unwrap();
        std::fs::write(own.join("Mine.md"), "my own note").unwrap();
        let dir = write_demo(tmp.path(), day("2026-11-09")).unwrap();
        assert_eq!(dir, own);
        assert_eq!(std::fs::read_dir(&own).unwrap().count(), 1);
        assert_eq!(
            std::fs::read_to_string(own.join("Mine.md")).unwrap(),
            "my own note"
        );
    }

    #[test]
    fn a_parent_that_is_not_a_folder_gives_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("nothing");
        assert!(write_demo(&missing, day("2026-11-09")).is_err());
    }
}
