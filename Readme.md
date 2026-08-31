# 🚀 CodeBin - Real Time Collaborative Code Editor 
CodeBin is a real-time collaborative code editor that allows multiple users to write, edit, and execute code together in shared rooms. It focuses on functionality, performance, and real-time collaboration.
> **The hosted demo is currently offline.** CodeBin runs locally in a few
> minutes — see [Getting Started](#-getting-started). Open two browser
> windows on the same room to see the collaboration features work.
## ✨ Features

- **Real-time Collaboration** – Multiple users can edit code simultaneously

- **Room-based Architecture** – Each room is isolated with its own state

- **Duplicate Username Prevention (Race-Condition Safe)** – Usernames are validated server-side at join time. If two users attempt to join a room simultaneously with the same username, only one request is accepted atomically.

- **Multi-Language Support**  – Java, Python, C++

- **Live Code Sync** – Monaco Editor synced via Socket.IO

- **Shared Console / Terminal**

  - Output visible to all users

  - Input shared in real time

- **Dark / Light Theme** – Context-based theme management

- **File Download** – Download current code with correct extension

- **AI Code Review (Gemini)** – Generate markdown-based code review with quality rating, issue detection, and suggested fixes

- **AI Coding Assistant (Gemini)** – Multi-turn, room-aware chat with per-user attribution, compressed memory, and shared responses

- **Fast UI** – Minimal, clean, performance-focused design

- **Auto-reconnect Support** – Handled by Socket.IO

# 🏗 Architecture Diagram

<img src="./uploads/image.png" alt="Alt text description" width="700" height="600">


<img src="./uploads/image2.png" alt="Alt text description" width="800" height="650">


## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or later)
- Docker (for code execution feature)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ankitsingathia/codetogether.git
cd codebin
```

2. Install server dependencies:
```bash
cd server
npm install
```

3. Install client dependencies:
```bash
cd ../client
npm install
```

### Configuration

1. Create a `.env` file in the server directory:
```env
PORT = 3001
BACKEND_URL = http://localhost
FRONTEND_ORIGIN = http://localhost:5173
GEMINI_API_KEY = your_gemini_api_key
```

2. Create a `.env` file in the client directory:
```env
VITE_SOCKET_URL = http://localhost:3001
```

### Running the Application

1. Start the server:
```bash
cd server
npm run dev
```

2. Start the client:
```bash
cd client
npm run dev
```

3. Access the application at `http://localhost:5173`

### Using AI in the Editor

1. Join or create a room.
2. Write or paste code in Monaco editor.
3. Use **AI Code Review** to analyze current code.
4. Use **AI Assistant** to ask targeted coding questions.
5. Review shared AI responses with all participants in the room.

## AI Chat Feature (Implemented)

### What it does

- **Room-scoped memory**: Each room has its own AI chat memory. One room never reads another room's memory.
- **Per-user attribution**: Each chat turn stores who asked the question and who the assistant is replying to.
- **Multi-turn continuity**: Assistant prompt includes room summary + recent turns + latest code + latest question.
- **Automatic compression**: Older chat turns are summarized when history grows too large, while recent turns stay detailed.
- **Shared assistant stream**: AI started/result events are broadcast to the room so all collaborators see context.
- **Persistent while room is active**: Memory is written to disk per room for reconnect/reload continuity.
- **Cleanup on empty room**: When last user disconnects from a room, that room's stored AI memory is deleted.
- **Model fallback for quota/rate-limit**: Backend tries primary Gemini model first, then falls back automatically on quota/rate-limit errors.

### Memory lifecycle

1. On room join, backend loads room memory from disk and sends assistant history to client.
2. On each assistant query, backend appends the new turn (askedBy/replyingTo/question/answer).
3. If history crosses thresholds (turn count or char budget), backend compresses older turns into summary.
4. Updated memory is persisted to disk for that room.
5. When room becomes empty, backend deletes that room memory file.

### Why this helps

- Better answer quality in long conversations
- Stable context across reconnects in active sessions
- Lower prompt size over time through summary compression
- Clean isolation and privacy between rooms

## Demo

<img src="./uploads/demo1.png" alt="Alt text description" width="1200" height="600">


<img src="./uploads/demo2.png" alt="Alt text description" width="800" height="650">

## 🛠 Tech Stack
### Frontend
- React 18
- Socket.IO Client
- Tailwind CSS
- Monaco Editor
- Vite
- Lucide Icons

### Backend
- Node.js
- Express
- Socket.IO
- Docker SDK
- dotenv

### Development Tools
- Git
- Docker

## 📧 Contact

Ankit Singathia - https://github.com/ankitsingathia
