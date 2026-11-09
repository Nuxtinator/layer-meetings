# @nuxtinator/meetings

One place per meeting for its recordings and files, its pasted transcript,
each participant's own notes, and the tasks that came out of it.

Needs the `records` and `views` layers: a meeting's tasks are `task`
records, so they show up in everyone's task views.

## Model

| Thing | What it is |
|---|---|
| **Meeting** | Title, date and time, optional location or link, visibility, and a pasted plain-text transcript |
| **Participant** | A team member, or an outside guest (name and optional email) |
| **File** | Any file uploaded to the private bucket; audio and video get an inline player |
| **Meeting notes** | One shared document per meeting, edited live |
| **Note** | One per user per meeting, in Markdown, private to its author |
| **Task** | A `task` record (records layer) whose `meeting` field points at the meeting |

Visibility is `org` (everyone with `meetings.read`) or `private` (the
creator, team members on the meeting, and `meetings.admin`). Only the key is
stored; labels live in [app/utils/meetings-format.ts](app/utils/meetings-format.ts).

## UI

- `/meetings` lists the meetings you can see.
- `/meetings/:id` has Notes, Transcript and Files tabs beside Tasks, Participants and My notes.
- The meetings sidebar's **My tasks** opens the views layer's built-in "My tasks" view.

**Meeting notes** is one shared document per meeting that everyone who can
edit the meeting writes in together, seeing each other's text and cursors as
they type; everyone else who can see the meeting watches it read-only. It
syncs with Yjs over the WebSocket at `/api/meetings/document-socket`, opened
with a two-minute ticket from `POST /api/meetings/meetings/:id/document/ticket`.
Open documents are held in memory on the server and saved to
`meetings_documents` (Yjs state plus a Markdown copy) shortly after each
change, so the layer assumes a single app server.

**Tasks** lists the meeting's task records (those whose `meeting` field
points at it) through the records API: add, edit, tick done (the task's
first closed status) and delete in place, with a link to each task's record
page. The same tasks are also the parameterized built-in view
`builtin.meeting-tasks.<meetingId>` (registered here), a list and a board
by status under `/views`.

**My notes** are private to each person and save as they type.
Files upload straight from the browser to the bucket through a presigned URL,
up to 4 GB each.

## Access

- The creator, team members on the meeting, and `meetings.admin` can edit it.
- The creator and `meetings.admin` can delete it.
- Anyone who can see a meeting can keep their own private notes on it.
- Anyone who can see a meeting can see its tasks (a records visibility
  source); editing them follows the records layer's task permissions.
- A task can be assigned to anyone. Assigning someone who can't see it yet
  asks first, as it does everywhere in records.
- Removing a team member from a meeting leaves the tasks assigned to them.
- Deleting a meeting deletes its tasks.

## Notifications

The records layer tells a task's new assignee, in the app and by email.

## AI

With the `ai` layer loaded and a model chosen for the feature:

| Feature | Does |
|---|---|
| `meetings.summary` | "Summarize transcript" adds a Markdown summary to your notes |
| `meetings.todos` | "Suggest from transcript" proposes tasks for you to review before they're created |

Without the `ai` layer, or with no model, the buttons are hidden.

## Permissions

- `meetings.access` — open the app
- `meetings.read` — see org-wide meetings and private ones you are on
- `meetings.create` — add meetings
- `meetings.admin` — see and edit every meeting

Default grants: `admin` gets all four; `member` gets all but `meetings.admin`.

## Records wiring

Registered in [server/plugins/register-meetings.ts](server/plugins/register-meetings.ts),
implemented in [server/utils/meetings-tasks.ts](server/utils/meetings-tasks.ts):

- a `meetings` ref source (labels, links and the picker for meeting refs);
- a `meeting` ref field added to `task`;
- a visibility source that shows a meeting's tasks to everyone who can see the meeting;
- the parameterized built-in view `meeting-tasks`.

`meetings_009_task_meeting_index` indexes tasks by their meeting.

## Tenancy

With the `tenancy` layer loaded, `meetings_T001_enable_tenancy` adds `org_id` +
row-level security to every table, so each org has its own meetings. The app
registers as `available`, so an org admin turns it on for their org; it
requires the `records` and `views` apps, which stay on while it is.

## Using it in a host

Add to the host's `layers.ts` (after the app layers, before `dev`):

```ts
{ id: 'meetings', pkg: '@nuxtinator/meetings', repo: 'Nuxtinator/layer-meetings', subdir: '', tagPrefix: 'v' }
```

then `bun run setup`. To work on a local checkout, set
`NUXTINATOR_MEETINGS_PATH=/path/to/layer-meetings` in the host's `.env`.
