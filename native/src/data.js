// Every beat is a data row on the one story machine (design rule 2). M3
// wires the chain 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 11 -> 12, skipping the
// still-missing 7-10 (castle interior + the chase decision) until M4 - a
// single-line `next` edit each time, nothing else touched.
export const BEATS = [
  {
    id: 'shadow-council', bg: 'shadow-council',
    faces: [{ key: 'darkness', x: 160, y: 62, scale: 1 }],
    dialogue: [
      { who: 'darkness', text: 'Winter answers to no one but me.' },
      { who: 'darkness', text: 'Let them search. The light I took will not be found.' },
    ],
    next: 'winter-falls',
  },
  {
    id: 'winter-falls', bg: 'pond',
    faces: [{ key: 'jack', x: 160, y: 68, scale: .8 }],
    dialogue: [
      { who: 'jack', text: "Lili? The ice wasn't broken when we crossed." },
      { who: 'jack', text: 'Something pulled her under the frost.' },
    ],
    game: 'icerain', g: {},
    gamePrompt: 'Strike the ice before her trail is lost!',
    successDialogue: [
      { who: 'jack', text: 'The ice breaks - but her footprints end here.' },
    ],
    next: 'bog-road',
  },
  {
    id: 'bog-road', bg: 'bog',
    faces: [{ key: 'gump', x: 90, y: 78, scale: .62 }, { key: 'jack', x: 210, y: 70, scale: .72 }],
    dialogue: [
      { who: 'gump', text: 'Three warning lights guard the causeway.' },
      { who: 'gump', text: 'Silence them out of order and the bog wakes.' },
    ],
    game: 'lights', g: { order: [1, 2, 0] },
    gamePrompt: 'Silence the lights: they do not want the obvious order.',
    successDialogue: [
      { who: 'gump', text: 'The bog sleeps. Onward, before it stirs again.' },
    ],
    next: 'megs-looking-glass',
  },
  {
    id: 'megs-looking-glass', bg: 'cottage',
    faces: [{ key: 'meg', x: 224, y: 58, scale: .82 }, { key: 'jack', x: 96, y: 78, scale: .68 }],
    dialogue: [
      { who: 'meg', text: 'What soft little champion wanders into my supper?' },
      { who: 'jack', text: 'One too humble for a lady as magnificent as you.' },
      { who: 'meg', text: 'Magnificent? Say that again, morsel.' },
    ],
    game: 'dial', g: { target: .35, tolerance: .12, x: 160, y: 108, start: -1.3 },
    gamePrompt: 'Turn the mirror; catch the moonlight on Meg.',
    successDialogue: [
      { who: 'jack', text: 'My knees shook. My hand did not.' },
    ],
    next: 'root-door',
  },
  {
    id: 'root-door', bg: 'roots',
    faces: [{ key: 'gump', x: 92, y: 70, scale: .68 }, { key: 'jack', x: 214, y: 78, scale: .7 }],
    dialogue: [
      { who: 'gump', text: 'Four stone mouths, and nowhere onward.' },
      { who: 'jack', text: 'Then we listen for the one that breathes.' },
    ],
    choice: {
      question: 'Which door leads down into the dark castle?',
      options: ['The mouth that hums', 'The mouth that is silent', 'The mouth that weeps'],
      correct: 0,
      retry: 'Silence and grief lead nowhere. Follow what still breathes.',
    },
    successDialogue: [
      { who: 'gump', text: 'Down, then. And quietly.' },
    ],
    next: 'gown-that-breathes',
  },
  {
    id: 'gown-that-breathes', bg: 'hall',
    faces: [
      { key: 'darkness', x: 232, y: 56, scale: .68 },
      { key: 'lili', x: 88, y: 62, scale: .68 },
    ],
    dialogue: [
      { who: 'darkness', text: 'The castle prepared a shape for your grief.' },
      { who: 'lili', text: 'An empty dress cannot decide who wears whom.' },
      { who: 'darkness', text: 'Step inside, and every frightened heart will kneel.' },
    ],
    choice: {
      question: "How can she learn the gown's purpose without surrendering?",
      options: ['Tear the gown', 'Wear it; keep watch', 'Call for Jack'],
      correct: 1,
      retry: 'Rage and rescue both yield control. Choose watchful courage.',
    },
    successDialogue: [
      { who: 'lili', text: 'The living folds close. I keep one hand free.' },
    ],
    next: 'spring-remembers',
  },
  {
    id: 'spring-remembers', bg: 'stream',
    faces: [{ key: 'gump', x: 78, y: 82, scale: .58 }, { key: 'jack', x: 158, y: 76, scale: .68 }],
    dialogue: [
      { who: 'gump', text: 'The stallion still waits beneath the winter spell.' },
      { who: 'jack', text: 'Then the stolen light must remember where it belongs.' },
    ],
    game: 'dial', g: { target: -.9, tolerance: .1, x: 240, y: 92, start: 1.2 },
    gamePrompt: "Turn the alicorn; align its living grain.",
    successDialogue: [
      { who: 'gump', text: 'The stallion rises. Spring has found the forest again.' },
    ],
    next: 'seventh-color',
  },
  {
    id: 'seventh-color', bg: 'forest', ending: true,
    faces: [
      { key: 'jack', x: 108, y: 62, scale: .68 },
      { key: 'lili', x: 212, y: 62, scale: .68 },
    ],
    dialogue: [
      { who: 'lili', text: 'The forest remembers spring - and I remember your hand.' },
      { who: 'jack', text: 'Winter is gone. One promise remains to make.' },
    ],
    choice: {
      question: 'What will Jack become to the living wood?',
      options: ['Its crowned master', 'Its listening guardian', 'A wanderer beyond it'],
      correct: 1,
      retry: 'The forest needs neither a crown nor abandonment. Listen.',
    },
    successDialogue: [
      { who: 'jack', text: 'I will guard its wonder by listening first.' },
    ],
    next: null,
  },
];
