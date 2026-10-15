//! Markdown → one self-contained HTML document. Raw HTML in notes is shown as text (escaped),
//! links are restricted to safe schemes, and images are embedded as data URIs.

use super::{exported_set, image_data_uri, prepare_markdown, slug, Doc, RenderOptions};
use crate::links::resolve::LinkResolver;
use crate::vault::OpenVault;
use pulldown_cmark::{html, CowStr, Event, Options, Parser, Tag};

const STYLE: &str = include_str!("style.css");

/// Escapes text for HTML element content and attribute values.
pub fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            c => out.push(c),
        }
    }
    out
}

/// Only web, mail and in-document links are kept; everything else (javascript:, file:, relative
/// paths) becomes `#`.
pub fn safe_href(href: &str) -> String {
    let h = href.trim();
    let lower = h.to_lowercase();
    if h.starts_with('#')
        || lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
    {
        h.to_string()
    } else {
        "#".to_string()
    }
}

/// Converts one prepared Markdown document body to HTML.
pub fn markdown_to_html(v: &OpenVault, note_path: &str, markdown: &str) -> String {
    let opts = Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TABLES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES;
    let events = Parser::new_ext(markdown, opts).map(|ev| match ev {
        // Raw HTML is written as escaped text, never as markup.
        Event::Html(s) | Event::InlineHtml(s) => Event::Text(s),
        Event::Start(Tag::Image {
            link_type,
            dest_url,
            title,
            id,
        }) => {
            let src = image_data_uri(v, note_path, &dest_url).unwrap_or_default();
            Event::Start(Tag::Image {
                link_type,
                dest_url: CowStr::from(src),
                title,
                id,
            })
        }
        Event::Start(Tag::Link {
            link_type,
            dest_url,
            title,
            id,
        }) => {
            let href = safe_href(&dest_url);
            Event::Start(Tag::Link {
                link_type,
                dest_url: CowStr::from(href),
                title,
                id,
            })
        }
        other => other,
    });
    let mut out = String::new();
    html::push_html(&mut out, events);
    out
}

/// Builds the complete HTML document for the notes.
pub fn render_html(v: &OpenVault, docs: &[Doc], opts: RenderOptions) -> String {
    let resolver = LinkResolver::new(&v.file_list());
    let exported = exported_set(docs);
    let title = match docs {
        [single] => single.title.clone(),
        _ => v.name(),
    };
    let mut body = String::new();
    if opts.include_toc && docs.len() > 1 {
        body.push_str("<nav class=\"toc\"><h2>Contents</h2><ul>");
        for d in docs {
            body.push_str(&format!(
                "<li><a href=\"#{}\">{}</a></li>",
                slug(&d.path),
                escape(&d.title)
            ));
        }
        body.push_str("</ul></nav>\n");
    }
    for d in docs {
        let md = prepare_markdown(d, &resolver, &exported, opts);
        let inner = markdown_to_html(v, &d.path, &md);
        let heading = if md.lines().any(|l| l.starts_with("# ")) {
            String::new()
        } else {
            format!("<h1>{}</h1>", escape(&d.title))
        };
        let id = if opts.folder {
            format!(" id=\"{}\"", slug(&d.path))
        } else {
            String::new()
        };
        body.push_str(&format!(
            "<section class=\"doc\"{id}>{heading}{inner}</section>\n"
        ));
    }
    format!(
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>{}</title>\n<style>{STYLE}</style>\n</head>\n<body>\n<main>\n{body}</main>\n</body>\n</html>\n",
        escape(&title)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::{collect, ExportFormat, ExportRequest, ExportScope};
    use crate::vault::{open_for_test, ops};

    fn render_note(v: &OpenVault, path: &str, text: &str) -> String {
        ops::write_note(v, path, text).unwrap();
        v.refresh_files();
        let req = ExportRequest {
            scope: ExportScope::Note,
            path: path.into(),
            format: ExportFormat::Html,
            include_toc: false,
            include_properties: false,
        };
        let docs = collect(v, &req).unwrap();
        render_html(
            v,
            &docs,
            RenderOptions {
                include_toc: false,
                include_properties: false,
                folder: false,
            },
        )
    }

    #[test]
    fn common_markdown_renders() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let html = render_note(&v, "n.md", "# Title\n\n**bold** and ~~gone~~\n\n- [x] done\n- [ ] todo\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```rust\nlet x = 1;\n```\n");
        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<strong>bold</strong>"));
        assert!(html.contains("<del>gone</del>"));
        assert!(html.contains("<table>"));
        assert!(html.contains("class=\"language-rust\""));
        assert!(html.contains("checked"));
    }

    #[test]
    fn raw_html_is_escaped_never_executed() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let html = render_note(
            &v,
            "x.md",
            "Hi <script>alert(1)</script> <img src=x onerror=alert(2)>\n\n<b>bold?</b>",
        );
        assert!(!html.contains("<script"), "{html}");
        assert!(!html.contains("<img src=x"), "{html}");
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("&lt;b&gt;bold?&lt;/b&gt;"));
    }

    #[test]
    fn dangerous_links_are_neutralised() {
        assert_eq!(safe_href("javascript:alert(1)"), "#");
        assert_eq!(safe_href("file:///etc/passwd"), "#");
        assert_eq!(safe_href("https://example.com"), "https://example.com");
        assert_eq!(safe_href("#note-x"), "#note-x");
    }

    #[test]
    fn images_inside_the_vault_are_embedded_outside_are_not() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        std::fs::create_dir_all(v.root.join("attachments")).unwrap();
        std::fs::write(v.root.join("attachments/pic.png"), [137u8, 80, 78, 71]).unwrap();
        let html = render_note(
            &v,
            "n.md",
            "![ok](attachments/pic.png)\n\n![no](../../etc/passwd.png)",
        );
        assert!(html.contains("data:image/png;base64,"));
        assert!(!html.contains("passwd.png\""), "{html}");
    }

    #[test]
    fn title_is_escaped() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let html = render_note(&v, "x.md", "# A <i>title</i>");
        assert!(!html.contains("<title><i>"));
    }

    #[test]
    fn frontmatter_is_hidden_unless_requested() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        let text = "---\ntitle: Plan\ntags: [a]\n---\n# Body\n";
        let hidden = render_note(&v, "n.md", text);
        assert!(!hidden.contains("Plan"));
        let req = ExportRequest {
            scope: ExportScope::Note,
            path: "n.md".into(),
            format: ExportFormat::Html,
            include_toc: false,
            include_properties: true,
        };
        let docs = collect(&v, &req).unwrap();
        let shown = render_html(
            &v,
            &docs,
            RenderOptions {
                include_toc: false,
                include_properties: true,
                folder: false,
            },
        );
        assert!(shown.contains("Property") && shown.contains("Plan"));
    }
}
