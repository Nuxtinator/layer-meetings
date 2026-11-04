# @nuxtinator/meetings

One place per meeting for its recordings and files, its pasted transcript,
each participant's own notes, and the todos that came out of it.

## Model

| Thing | What it is |
|---|---|
| **Meeting** | Title, date and time, optional location or link, visibility, and a pasted plain-text transcript |
| **Participant** | A team member, or an outside guest (name and optional email) |
| **File** | Any file uploaded to the private bucket; audio and video get an inline player |
| **Note** | One per user per meeting, in Markdown, private until its author shares it |
| **Todo** | Text, optional assignee (a team member on the meeting), optional due date, done or not |

Visibility is `org` (everyone with `meetings.read`) or `private` (the
creator, team members on the meeting, and `meetings.admin`). Only the key is
stored; labels live in [app/utils/meetings-format.ts](app/utils/meetings-format.ts).

## UI

- `/meetings` lists the meetings you can see.
- `/meetings/:id` has Notes, Transcript and Files tabs beside Todos and Participants.
- `/meetings/todos` lists open or done todos assigned to you across meetings.

Notes save as you type. Each person has their own, so no one overwrites anyone.
Files upload straight from the browser to the bucket through a presigned URL,
up to 4 GB each.

## Access

- The creator, team members on the meeting, and `meetings.admin` can edit it.
- The creator and `meetings.admin` can delete it.
- Anyone who can see a meeting can keep their own notes on it.
- Removing a team member from a meeting unassigns their todos on it.

## Notifications

Assigning a todo notifies the assignee in the app and by email, through
core's notification path.

## AI

With the `ai` layer loaded and a model chosen for the feature:

| Feature | Does |
|---|---|
| `meetings.summary` | "Summarize transcript" adds a Markdown summary to your notes |
| `meetings.todos` | "Suggest" proposes todos from the transcript for you to review before saving |

Without the `ai` layer, or with no model, the buttons are hidden.

## Permissions

- `meetings.access` — open the app
- `meetings.read` — see org-wide meetings and private ones you are on
- `meetings.create` — add meetings
- `meetings.admin` — see and edit every meeting

Default grants: `admin` gets all four; `member` gets all but `meetings.admin`.

## Tenancy

With the `tenancy` layer loaded, `meetings_T001_enable_tenancy` adds `org_id` +
row-level security to every table, so each org has its own meetings. The app
registers as `available`, so an org admin turns it on for their org.

## Using it in a host

Add to the host's `layers.ts` (after the app layers, before `dev`):

```ts
{ id: 'meetings', pkg: '@nuxtinator/meetings', repo: 'Nuxtinator/layer-meetings', subdir: '', tagPrefix: 'v' }
```

then `bun run setup`. To work on a local checkout, set
`NUXTINATOR_MEETINGS_PATH=/path/to/layer-meetings` in the host's `.env`.
