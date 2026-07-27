# real-time-collaborative-coding-platform Client

Frontend for real-time-collaborative-coding-platform real-time collaborative editor.

## Run

1. Install dependencies

```bash
npm install
```

2. Configure environment

```env
VITE_SOCKET_URL=http://localhost:3001
```

3. Start development server

```bash
npm run dev
```

## AI Chat (Client Behavior)

- Opens in editor via the Assist action.
- Shows who asked each question.
- Shows current assistant status (replying to which user while generating).
- Hydrates room chat history when joining/rejoining a room.
- Displays shared assistant responses for all room members in real time.

## Notes

- Full system documentation is in the root README at ../Readme.md.
