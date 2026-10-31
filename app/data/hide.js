// These start hidden on a new install, so the first look is clean. Holding OK on an app arranges or hides it, and Settings brings any of them back.
window.EDISON_HIDE = [
  'ShopTime', 'LG Streaming Week', 'LG Radio+', 'LG Travel+', 'LG Sports Playbook', 'LG Gallery+', 'LG Gaming Portal', '8 Ball Pool',
  'Weekend Games - Song Quiz, Jeopardy! and CoComelon', 'Copilot', 'Sports', 'Home Hub', 'Camera', 'Media Player', 'Amazon Alexa'
];
window.EDISON_FIRST = [];
// One color per group: well-known streaming, other streaming, live and LG, and tools. Anything else gets its own color.
window.EDISON_GROUPS = {
  'Apple TV': 1, 'Netflix': 1, 'YouTube': 1, 'XBOX Game Console': 1, 'LG Channels': 1,
  'Prime Video': 3, 'Disney+': 3, 'Hulu': 3, 'HBO Max': 3, 'Tubi: Free Movies & TV': 3, 'Pluto TV': 3, 'ESPN': 3,
  'Live TV': 4, 'LG Movies & TV': 4,
  'Apps': 5, 'Web Browser': 5, 'Developer Mode': 5
};
// Shorter names for the keys. Anything not listed shows its full name.
window.EDISON_SHORT = {
  'Tubi: Free Movies & TV': 'Tubi', 'XBOX Game Console': 'Xbox', 'LG Movies & TV': 'LG Movies', 'Developer Mode': 'Dev Mode'
};
// A line or two of his own for some apps. Other apps get his general lines.
window.EDISON_APP_LINES = {
  'Netflix': ['app-netflix-1', 'app-netflix-2'], 'Apple TV': ['app-apple-1'], 'YouTube': ['app-youtube-1', 'app-youtube-2'], 'XBOX Game Console': ['app-xbox-1', 'app-xbox-2'],
  'ESPN': ['app-espn-1'], 'Disney+': ['app-disney-1'], 'Prime Video': ['app-prime-1'], 'HBO Max': ['app-hbo-1'], 'Tubi: Free Movies & TV': ['app-free-1'], 'Pluto TV': ['app-free-1'],
  'Web Browser': ['app-web-1'], 'Developer Mode': ['app-dev-1'], 'Live TV': ['app-live-1']
};
// The backgrounds offered in Settings. file is in backs/; the still picture is the lightest for the TV.
window.EDISON_BACKS = [
  { id: 'still', name: 'STILL', planets: true }, { id: 'galaxy', name: 'GALAXY', file: 'galaxy', planets: true }, { id: 'deepfield', name: 'DEEP FIELD', file: 'deepfield' }, { id: 'nebula', name: 'NEBULA', file: 'nebula' },
  { id: 'horizon', name: 'HORIZON', file: 'horizon' }, { id: 'aurora', name: 'AURORA', file: 'aurora' }, { id: 'cruise', name: 'CRUISE', file: 'cruise' }, { id: 'random', name: 'RANDOM' }
];
