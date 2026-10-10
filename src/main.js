import { restoreSession } from './account/session.js'
import { $ } from './core/util.js'
import './quiz/modes/index.js'
import './ui/account.js'
import './ui/explore.js'
import './ui/home.js'
import './ui/leaderboard.js'
import { navigate } from './ui/navigation.js'

$('#btnHome').onclick = () => navigate('home')
navigate('home')
restoreSession()

if ('serviceWorker' in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register('/sw.js').catch(() => {})
