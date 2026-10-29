import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import purplLogo from './PURPL_Logo.png'
import './styles.css'

const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/png'
favicon.href = purplLogo
document.head.append(favicon)

createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>)
