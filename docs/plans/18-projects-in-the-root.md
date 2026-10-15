> **Status: implemented in 0.8.0.** See docs/DECISIONS.md (Version 0.8.0) and CHANGELOG.md.

# Feature 18 – A project is always a new folder in the vault root

Branch: `feat/projects-in-root`. Read [README.md](README.md) first (rules, definition of done).

## Why

A project could be made from any folder, and a new project was made inside the selected folder. A user made a folder `test` and then a project `test`, which ended up as `test/test`: a project and a folder with the same name that lay inside each other, listed twice (under Projects and in All files). Projects were also allowed at any depth, which made the tree hard to follow.

## What the user gets

- **New → Project…** opens the project window. The name is also the **name of a new folder in the vault root**; it is created at once, whatever is selected in the tree.
- **A folder cannot be turned into a project.** "Make project" is removed from the menus. To bring existing notes in, drag them onto the project.
- A name that is already used in the root (a folder, a note, another project, in any case) is explained while typing and **Save** is disabled.
- A project can be **renamed** (its folder name changes with it, and so does the project name when they matched) but **not moved into a folder** (a dialog says so).

## Decisions (already made)

| Question                    | Decision                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where is the rule enforced? | In the backend: `projects::service::create(v, name, …)` makes the folder with `fs_ops::create_folder(root, "", name)` (which refuses taken names and names with a slash) and the project; `vault::ops::rename_no_commit` refuses to move a project folder to a path with a `/` and keeps `project.name` in step with a renamed folder. The window checks the same rules while typing. |
| Old projects inside folders | Keep working. They can be moved to the root, nowhere else. `validate_new` (the no-nesting check) is removed because a new project can never be nested.                                                                                                                                                                                                                                |
| Tauri command               | `create_project(name, instructions, providerId)`; the `folder` argument is gone.                                                                                                                                                                                                                                                                                                      |
| Name = folder name          | For new projects yes. The display name can still be edited in the project settings (it must stay unique).                                                                                                                                                                                                                                                                             |

## Manual test

See docs/MANUAL_TESTS.md, section 38.
