//! Markdown → Word (.docx). Lists use text markers (•, 1.) instead of Word numbering.

use super::{exported_set, image_bytes, prepare_markdown, Doc, RenderOptions};
use crate::error::{AppError, AppResult};
use crate::links::resolve::LinkResolver;
use crate::vault::OpenVault;
use docx_rs::{
    BreakType, Docx, Hyperlink, HyperlinkType, Paragraph, Pic, Run, RunFonts, Table, TableCell,
    TableRow,
};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use std::io::Cursor;

const MONO: &str = "Consolas";

/// Something that goes inside a paragraph: plain text or a clickable link.
// Built once per paragraph and short-lived, so the size difference costs nothing.
#[allow(clippy::large_enum_variant)]
enum Inline {
    Run(Run),
    Link(Hyperlink),
}

#[allow(clippy::large_enum_variant)]
enum Block {
    Para(Paragraph),
    Table(Table),
}

#[derive(Default)]
struct Walker<'a> {
    v: Option<&'a OpenVault>,
    note: &'a str,
    blocks: Vec<Block>,
    runs: Vec<Inline>,
    bold: u32,
    italic: u32,
    strike: u32,
    heading: Option<HeadingLevel>,
    lists: Vec<Option<u64>>,
    quote: u32,
    code_block: Option<String>,
    link: Option<(String, usize)>,
    table: Option<Vec<Vec<String>>>,
    cell: Option<String>,
    skip_text: u32,
    header_row: bool,
    table_header: Vec<Vec<String>>,
}

impl<'a> Walker<'a> {
    fn text_run(&self, text: &str) -> Run {
        let mut run = Run::new().add_text(text);
        if self.bold > 0 || self.heading.is_some() {
            run = run.bold();
        }
        if self.italic > 0 {
            run = run.italic();
        }
        if self.strike > 0 {
            run = run.strike();
        }
        if let Some(level) = self.heading {
            run = run.size(match level {
                HeadingLevel::H1 => 34,
                HeadingLevel::H2 => 30,
                HeadingLevel::H3 => 26,
                _ => 24,
            });
        }
        run
    }

    fn push_run(&mut self, run: Run) {
        self.runs.push(Inline::Run(run));
    }

    fn flush(&mut self) {
        if self.runs.is_empty() {
            return;
        }
        let mut p = Paragraph::new();
        let depth = self.lists.len().saturating_sub(1) as i32;
        let quote = self.quote as i32;
        let indent = depth * 360 + quote * 720;
        if indent > 0 {
            p = p.indent(Some(indent), None, None, None);
        }
        for item in self.runs.drain(..) {
            p = match item {
                Inline::Run(r) => p.add_run(r),
                Inline::Link(l) => p.add_hyperlink(l),
            };
        }
        self.blocks.push(Block::Para(p));
    }

    fn mono_paragraph(line: &str) -> Paragraph {
        Paragraph::new().add_run(
            Run::new()
                .add_text(if line.is_empty() { " " } else { line })
                .fonts(RunFonts::new().ascii(MONO)),
        )
    }

    fn handle(&mut self, ev: Event<'a>) {
        match ev {
            Event::Start(Tag::Heading { level, .. }) => self.heading = Some(level),
            Event::End(TagEnd::Heading(_)) => {
                self.flush();
                self.heading = None;
            }
            Event::Start(Tag::Paragraph) | Event::Start(Tag::BlockQuote(_)) => {
                if matches!(ev, Event::Start(Tag::BlockQuote(_))) {
                    self.quote += 1;
                }
            }
            Event::End(TagEnd::Paragraph) => self.flush(),
            Event::End(TagEnd::BlockQuote(_)) => {
                self.flush();
                self.quote = self.quote.saturating_sub(1);
            }
            Event::Start(Tag::List(start)) => self.lists.push(start),
            Event::End(TagEnd::List(_)) => {
                self.flush();
                self.lists.pop();
            }
            Event::Start(Tag::Item) => {
                let marker = match self.lists.last_mut() {
                    Some(Some(n)) => {
                        let s = format!("{n}. ");
                        *n += 1;
                        s
                    }
                    _ => "• ".to_string(),
                };
                self.push_run(Run::new().add_text(marker));
            }
            Event::End(TagEnd::Item) => self.flush(),
            Event::TaskListMarker(checked) => {
                self.push_run(Run::new().add_text(if checked { "☑ " } else { "☐ " }));
            }
            Event::Start(Tag::Emphasis) => self.italic += 1,
            Event::End(TagEnd::Emphasis) => self.italic = self.italic.saturating_sub(1),
            Event::Start(Tag::Strong) => self.bold += 1,
            Event::End(TagEnd::Strong) => self.bold = self.bold.saturating_sub(1),
            Event::Start(Tag::Strikethrough) => self.strike += 1,
            Event::End(TagEnd::Strikethrough) => self.strike = self.strike.saturating_sub(1),
            Event::Start(Tag::Link { dest_url, .. }) => {
                self.link = Some((dest_url.to_string(), self.runs.len()));
            }
            Event::End(TagEnd::Link) => {
                if let Some((url, start)) = self.link.take() {
                    let inner: Vec<Inline> = self.runs.drain(start..).collect();
                    let is_web = url.starts_with("http://")
                        || url.starts_with("https://")
                        || url.starts_with("mailto:");
                    if is_web {
                        let mut link = Hyperlink::new(&url, HyperlinkType::External);
                        for item in inner {
                            if let Inline::Run(r) = item {
                                link = link.add_run(r);
                            }
                        }
                        self.runs.push(Inline::Link(link));
                    } else {
                        self.runs.extend(inner);
                    }
                }
            }
            Event::Start(Tag::Image { dest_url, .. }) => {
                if let Some(v) = self.v {
                    if let Some((_, bytes)) = image_bytes(v, self.note, &dest_url) {
                        self.push_run(Run::new().add_image(Pic::new(&bytes)));
                    }
                }
                self.skip_text += 1;
            }
            Event::End(TagEnd::Image) => self.skip_text = self.skip_text.saturating_sub(1),
            Event::Start(Tag::CodeBlock(_)) => self.code_block = Some(String::new()),
            Event::End(TagEnd::CodeBlock) => {
                if let Some(code) = self.code_block.take() {
                    for line in code.trim_end_matches('\n').split('\n') {
                        self.blocks.push(Block::Para(Self::mono_paragraph(line)));
                    }
                }
            }
            Event::Start(Tag::Table(_)) => {
                self.table = Some(Vec::new());
                self.table_header.clear();
            }
            Event::Start(Tag::TableHead) => self.header_row = true,
            Event::End(TagEnd::TableHead) => {
                if let Some(rows) = self.table.as_mut() {
                    let head = rows.pop().unwrap_or_default();
                    self.table_header = vec![head];
                }
                self.header_row = false;
            }
            Event::Start(Tag::TableRow) => {
                if let Some(rows) = self.table.as_mut() {
                    rows.push(Vec::new());
                }
            }
            Event::Start(Tag::TableCell) => self.cell = Some(String::new()),
            Event::End(TagEnd::TableCell) => {
                let text = self.cell.take().unwrap_or_default();
                if let Some(rows) = self.table.as_mut() {
                    if let Some(row) = rows.last_mut() {
                        row.push(text);
                    } else {
                        rows.push(vec![text]);
                    }
                }
            }
            Event::End(TagEnd::Table) => {
                let mut rows: Vec<TableRow> = Vec::new();
                if let Some(head) = self.table_header.first() {
                    rows.push(TableRow::new(
                        head.iter().map(|t| cell_of(t, true)).collect(),
                    ));
                }
                if let Some(body) = self.table.take() {
                    for r in body {
                        rows.push(TableRow::new(r.iter().map(|t| cell_of(t, false)).collect()));
                    }
                }
                self.blocks.push(Block::Table(Table::new(rows)));
            }
            Event::Code(code) => {
                if let Some(c) = self.cell.as_mut() {
                    c.push_str(&code);
                } else {
                    self.push_run(
                        Run::new()
                            .add_text(code.to_string())
                            .fonts(RunFonts::new().ascii(MONO)),
                    );
                }
            }
            Event::Text(text) => {
                if let Some(code) = self.code_block.as_mut() {
                    code.push_str(&text);
                } else if let Some(c) = self.cell.as_mut() {
                    c.push_str(&text);
                } else if self.skip_text == 0 {
                    let run = self.text_run(&text);
                    self.push_run(run);
                }
            }
            Event::Html(text) | Event::InlineHtml(text) => {
                // Shown as literal text (Word escapes it), never interpreted.
                if self.skip_text == 0 {
                    let run = self.text_run(&text);
                    self.push_run(run);
                }
            }
            Event::SoftBreak => self.push_run(Run::new().add_text(" ")),
            Event::HardBreak => self.push_run(Run::new().add_break(BreakType::TextWrapping)),
            Event::Rule => {
                self.flush();
                self.blocks.push(Block::Para(
                    Paragraph::new().add_run(Run::new().add_text("────────────────────")),
                ));
            }
            _ => {}
        }
    }
}

fn cell_of(text: &str, bold: bool) -> TableCell {
    let mut run = Run::new().add_text(text);
    if bold {
        run = run.bold();
    }
    TableCell::new().add_paragraph(Paragraph::new().add_run(run))
}

/// Converts one document to Word blocks.
fn blocks_for(
    v: &OpenVault,
    doc: &Doc,
    resolver: &LinkResolver,
    exported: &std::collections::HashSet<String>,
    opts: RenderOptions,
) -> Vec<Block> {
    let md = prepare_markdown(doc, resolver, exported, opts);
    let parser_opts = Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TABLES
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES;
    let mut walker = Walker {
        v: Some(v),
        note: &doc.path,
        ..Default::default()
    };
    for ev in Parser::new_ext(&md, parser_opts) {
        walker.handle(ev);
    }
    walker.flush();
    walker.blocks
}

/// Builds a .docx containing the notes (a page break between notes).
pub fn render_docx(v: &OpenVault, docs: &[Doc], opts: RenderOptions) -> AppResult<Vec<u8>> {
    let resolver = LinkResolver::new(&v.file_list());
    let exported = exported_set(docs);
    let mut all: Vec<Block> = Vec::new();
    for (i, d) in docs.iter().enumerate() {
        if i > 0 {
            all.push(Block::Para(
                Paragraph::new().add_run(Run::new().add_break(BreakType::Page)),
            ));
        }
        all.extend(blocks_for(v, d, &resolver, &exported, opts));
    }
    let mut docx = Docx::new();
    for b in all {
        docx = match b {
            Block::Para(p) => docx.add_paragraph(p),
            Block::Table(t) => docx.add_table(t),
        };
    }
    let mut buf = Cursor::new(Vec::new());
    docx.build()
        .pack(&mut buf)
        .map_err(|e| AppError::Io(format!("Word export failed: {e}")))?;
    Ok(buf.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::{collect, ExportFormat, ExportRequest, ExportScope};
    use crate::vault::{open_for_test, ops};
    use std::io::Read;

    fn document_xml(bytes: &[u8]) -> String {
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut file = zip.by_name("word/document.xml").unwrap();
        let mut s = String::new();
        file.read_to_string(&mut s).unwrap();
        s
    }

    #[test]
    fn word_document_has_structure() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "n.md", "# Heading One\n\nSome **bold** text and a [link](https://example.com).\n\n- first\n- second\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<b>raw</b>\n").unwrap();
        v.refresh_files();
        let req = ExportRequest {
            scope: ExportScope::Note,
            path: "n.md".into(),
            format: ExportFormat::Docx,
            include_toc: false,
            include_properties: false,
        };
        let docs = collect(&v, &req).unwrap();
        let bytes = render_docx(
            &v,
            &docs,
            RenderOptions {
                include_toc: false,
                include_properties: false,
                folder: false,
            },
        )
        .unwrap();
        let xml = document_xml(&bytes);
        assert!(xml.contains("Heading One"));
        assert!(xml.contains("<w:b"));
        assert!(xml.contains("<w:tbl>"));
        // A Word hyperlink keeps its URL in the relationships part; the body only refers to it.
        let mut zip = zip::ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let mut rels = String::new();
        zip.by_name("word/_rels/document.xml.rels")
            .unwrap()
            .read_to_string(&mut rels)
            .unwrap();
        assert!(rels.contains("https://example.com"));
        assert!(xml.contains("w:hyperlink"));
        // Raw HTML is literal text; the escaped form (or the words) must be in the body.
        assert!(xml.contains("raw"), "raw HTML text must be kept as text");
        assert!(
            !xml.contains("<w:b/><w:t>raw"),
            "raw HTML must not become formatting"
        );
        assert!(xml.contains("•") && xml.contains("first"));
    }

    #[test]
    fn folder_export_has_a_page_break_between_notes() {
        let d = tempfile::tempdir().unwrap();
        let v = open_for_test(d.path());
        ops::write_note(&v, "a.md", "# A").unwrap();
        ops::write_note(&v, "b.md", "# B").unwrap();
        v.refresh_files();
        let docs = vec![
            Doc {
                path: "a.md".into(),
                title: "A".into(),
                markdown: "# A".into(),
            },
            Doc {
                path: "b.md".into(),
                title: "B".into(),
                markdown: "# B".into(),
            },
        ];
        let bytes = render_docx(
            &v,
            &docs,
            RenderOptions {
                include_toc: false,
                include_properties: false,
                folder: true,
            },
        )
        .unwrap();
        assert!(document_xml(&bytes).contains("w:type=\"page\""));
    }
}
