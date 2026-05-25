export const communityFunCommandDefinitions = Object.freeze([
  {
    name: 'timmy',
    description: 'Runs the Timmy go-live check.',
    icon: '\u{1F4FA}',
    title: 'Timmy Check',
    responses: [
      'Timmy status: still not live. Chat is pacing politely.',
      'Timmy, the go-live button is right there. Allegedly.',
      'Stream forecast says 100% chance of chat asking for a live.'
    ]
  },
  {
    name: 'cope',
    description: 'Measures the server cope level.',
    icon: '\u{1F9EA}',
    title: 'Cope Meter',
    responses: [
      'Cope level: professionally contained.',
      'Cope reserves are low. Hydrate and pretend that was planned.',
      'System detected premium-grade coping with clean form.'
    ]
  },
  {
    name: 'ratio',
    description: 'Runs a fake ratio lab report.',
    icon: '\u{1F4C9}',
    title: 'Ratio Lab',
    responses: [
      'Ratio simulation complete. The numbers look disrespectful.',
      'Preliminary ratio results: chat may need a moment.',
      'Ratio lab says this one has dangerous comeback potential.'
    ]
  },
  {
    name: 'pingdev',
    description: 'Simulates a safe developer ping.',
    icon: '\u{1F6CE}',
    title: 'Developer Ping',
    responses: [
      'Developer ping simulated. No actual developers were harmed or notified.',
      'Queued a pretend dev ping. It arrived directly in the void.',
      'Dev console received the vibe. Response time: emotionally unavailable.'
    ]
  },
  {
    name: 'production',
    description: 'Checks the fake Production system status.',
    icon: '\u{1F3ED}',
    title: 'Production Status',
    responses: [
      'Production is online, calm, and definitely not held together by hope.',
      'Status: green enough. Logs are behaving suspiciously well.',
      'Production check passed. Please do not breathe on the deploy button.'
    ]
  },
  {
    name: 'whoasked',
    description: 'Searches the official who-asked archive.',
    icon: '\u{1F50D}',
    title: 'Who Asked Archive',
    responses: [
      'Search complete: no matching request found.',
      'The archive returned zero results and one raised eyebrow.',
      'No ask detected. Please file a ticket with the Department of Nobody.'
    ]
  },
  {
    name: 'touchgrass',
    description: 'Issues a lightweight grass-touch reminder.',
    icon: '\u{1F331}',
    title: 'Grass Advisory',
    responses: [
      'Reminder queued: touch grass, then come back with better frames.',
      'Outdoor patch notes available. Sunlight remains optional but recommended.',
      'Grass proximity scan failed. Please approach a lawn at a safe speed.'
    ]
  },
  {
    name: 'deploy',
    description: 'Prints a fake community deploy log.',
    icon: '\u{1F680}',
    title: 'Fake Deploy',
    responses: [
      '```ansi\n[deploy] building vibes...\n[deploy] tests: suspiciously green\n[deploy] shipped: one tiny amount of chaos\n```',
      '```ansi\n$ npm run deploy:pretend\n\u2713 compiled excuses\n\u2713 synced confidence\n\u2713 no production servers were touched\n```',
      '```ansi\n[release] staging jokes\n[release] warming cache\n[release] deploy complete-ish\n```'
    ]
  },
  {
    name: 'fixbot',
    description: 'Runs a fake bot repair sequence.',
    icon: '\u{1F6E0}',
    title: 'Bot Repair',
    responses: [
      '```ansi\n[repair] checking wires\n[repair] polishing embeds\n[repair] result: looks expensive now\n```',
      'Fixbot applied one gentle restart and three confident nods.',
      'Diagnostics complete. The bot says it was the API.'
    ]
  },
  {
    name: 'skillissue',
    description: 'Diagnoses a certified skill issue.',
    icon: '\u{1F3AF}',
    title: 'Skill Issue Report',
    responses: [
      'Diagnosis: possible skill issue. Treatment: one deep breath and a second attempt.',
      'Skill issue detected, but it is recoverable with enough confidence.',
      'The council reviewed the clip and prescribed practice mode.'
    ]
  },
  {
    name: 'wakeupalex',
    description: 'Runs the harmless Alex wake-up protocol.',
    icon: '\u{23F0}',
    title: 'Alex Wake Protocol',
    responses: [
      'Wake protocol armed. No real pings sent. The suspense is doing the work.',
      'Alex wake sequence simulated. Alarm volume: morally questionable.',
      'System whispered "wake up" into the logs. Very professional.'
    ]
  },
  {
    name: 'commit',
    description: 'Generates a fake commit message.',
    icon: '\u{1F4BE}',
    title: 'Commit Generator',
    responses: [
      '`fix: convince the bot everything is fine`',
      '`feat: add suspiciously specific community command energy`',
      '`chore: move chaos into a nicer embed`'
    ]
  },
  {
    name: 'hotfix',
    description: 'Starts a fake hotfix console.',
    icon: '\u{1FA79}',
    title: 'Hotfix Console',
    responses: [
      '```ansi\n[hotfix] locating issue\n[hotfix] applying tape\n[hotfix] pretending this was planned\n```',
      'Hotfix status: patched, polished, and legally classified as fine.',
      'Emergency fix complete. Nobody look directly at the diff.'
    ]
  },
  {
    name: 'brokeyit',
    description: 'Files a fake incident report.',
    icon: '\u{1F4A5}',
    title: 'Incident Report',
    responses: [
      'Incident filed: somebody touched the thing.',
      'Root cause: confidence exceeded available testing.',
      'Report complete. The bot has chosen forgiveness, barely.'
    ]
  }
]);

export const globalCommunityFunCommandDefinitions = Object.freeze(
  communityFunCommandDefinitions.filter((command) => command.name !== 'timmy')
);

export const globalCommunityFunCommandNames = Object.freeze(
  globalCommunityFunCommandDefinitions.map((command) => command.name)
);

export function communityFunCommandDefinitionFor(commandName) {
  return communityFunCommandDefinitions.find((command) => command.name === String(commandName ?? '').trim().toLowerCase()) ?? null;
}

export function globalCommunityFunCommandDefinitionFor(commandName) {
  return globalCommunityFunCommandDefinitions.find((command) => command.name === String(commandName ?? '').trim().toLowerCase()) ?? null;
}
