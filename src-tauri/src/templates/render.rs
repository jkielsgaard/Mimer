//! Template variable rendering: `{{title}}`, `{{date}}`, `{{time}}`, `{{datetime}}`,
//! `{{weekday}}`, `{{date:FORMAT}}`, `{{time:FORMAT}}`.

use chrono::{DateTime, Local};
use regex::Regex;
use std::fmt::Write;
use std::sync::LazyLock;

static VAR_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{\{\s*([a-z]+)(?::([^}]*?))?\s*\}\}").expect("valid template regex")
});

/// Formats a time with a strftime pattern. Returns `None` for an invalid pattern
/// (chrono panics on `to_string()` in that case, so we write and check the result).
pub fn format_time(now: &DateTime<Local>, pattern: &str) -> Option<String> {
    let mut out = String::new();
    write!(out, "{}", now.format(pattern)).ok()?;
    Some(out)
}

/// Replaces template variables. Unknown variables and invalid formats stay as typed.
pub fn render(template: &str, title: &str, now: &DateTime<Local>) -> String {
    VAR_RE
        .replace_all(template, |caps: &regex::Captures| {
            let original = caps[0].to_string();
            let name = &caps[1];
            let arg = caps.get(2).map(|m| m.as_str());
            let value = match (name, arg) {
                ("title", None) => Some(title.to_string()),
                ("date", None) => format_time(now, "%Y-%m-%d"),
                ("time", None) => format_time(now, "%H:%M"),
                ("datetime", None) => format_time(now, "%Y-%m-%d %H:%M"),
                ("weekday", None) => format_time(now, "%A"),
                ("date", Some(fmt)) | ("time", Some(fmt)) => format_time(now, fmt),
                _ => None,
            };
            value.unwrap_or(original)
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn now() -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 10, 13, 15, 4, 5)
            .single()
            .expect("valid time")
    }

    #[test]
    fn replaces_builtin_variables() {
        let out = render(
            "{{title}} {{date}} {{time}} {{datetime}} {{weekday}}",
            "Plan",
            &now(),
        );
        assert_eq!(out, "Plan 2026-10-13 15:04 2026-10-13 15:04 Tuesday");
    }

    #[test]
    fn spaces_and_custom_formats() {
        assert_eq!(render("{{ date }}", "", &now()), "2026-10-13");
        assert_eq!(render("{{date:%d %B %Y}}", "", &now()), "13 October 2026");
        assert_eq!(render("{{time:%H.%M}}", "", &now()), "15.04");
    }

    #[test]
    fn unknown_and_invalid_are_left_alone() {
        assert_eq!(render("{{unknown}}", "", &now()), "{{unknown}}");
        assert_eq!(render("{{date:%Q}}", "", &now()), "{{date:%Q}}");
        assert_eq!(render("{{ not closed", "", &now()), "{{ not closed");
        assert_eq!(render("plain text", "", &now()), "plain text");
    }
}
