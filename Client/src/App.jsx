
import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import AppLayout from './layouts/AppLayout.jsx'
import EditorLayout from './layouts/EditorLayout.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import CreateRoom from './pages/CreateRoom.jsx'
import Editor from './pages/Editor.jsx'

function App() {

  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path='/' element={<Home />} />
            <Route path='/create-room' element={<CreateRoom />} />
          </Route>

          {/* Layout WITHOUT footer */}
          <Route element={<EditorLayout />}>
            <Route path="/editor/:roomId?" element={<Editor />} />
          </Route>

        </Routes>
      </HashRouter>
    </ThemeProvider>
  )
}

export default App
