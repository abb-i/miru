// Miru — Wording Engine
// Each screen type draws from its own pool. Words never repeat within 5 uses.

const WORDS = {
  navigation: [
    'Germinating.', 'Steeping.', 'Composting.', 'Rooting.', 'Settling.',
    'Unfurling.', 'Ripening.', 'Resting.', 'Returning.', 'Grounding.',
    'Arriving.', 'Pooling.', 'Deepening.', 'Softening.', 'Clearing.',
    'Percolating.', 'Absorbing.', 'Sinking.', 'Stilling.', 'Centering.',
    'Mending.', 'Opening.', 'Collecting.', 'Dwelling.', 'Remembering.'
  ],
  periodic: [
    'Surfacing.', 'Resetting.', 'Refilling.', 'Replenishing.', 'Reconsidering.',
    'Pausing.', 'Unwinding.', 'Releasing.', 'Tending.', 'Watering.',
    'Nourishing.', 'Warming.', 'Loosening.', 'Stretching.', 'Noticing.',
    'Witnessing.', 'Listening.', 'Visiting.', 'Landing.', 'Exhaling.'
  ],
  blocker: [
    'Not today.', 'Not yet.', 'Still growing.', 'Protecting focus.',
    'Staying rooted.', 'Already enough.', 'Holding ground.', 'Staying present.',
    'Not this moment.', 'Resisting gently.', 'Guarding time.',
    'Choosing depth.', 'Staying the course.', 'Tending elsewhere.'
  ],
  tabLimit: [
    'Is this necessary?', 'What are you looking for?',
    'More tabs, less depth.', 'One thing at a time.',
    'Go deep, not wide.', 'Proceed with intention.'
  ],
  focusStart: [
    'Beginning the work.', 'Setting the field.', 'Cultivating.',
    'Planting the hours.', 'Entering.', 'Dedicating.'
  ],
  focusEnd: [
    'Harvesting focus.', 'Completing the season.', 'Session finished.',
    'Returning to open air.', 'The field rests.', 'Well tended.'
  ],
  night: [
    'Tending the night.', 'The day has set.', 'Resting until morning.',
    'Let it wait for light.', 'Night holds its own quiet.'
  ],
  timeMirror: [
    'Still here.', 'Time pools quietly.', 'The water is deep here.',
    'A long visit.', 'Look up for a moment.', 'Notice the hour.',
    'Roots, or ruts?', 'Surface for air.', 'The garden waits outside.',
    'How does this feel?', 'Deep in one place.', 'The light has moved.'
  ],
  breakEnd: [
    'The break is over.', 'Rested and returning.', 'Back to the field.',
    'Well paused.', 'Picking up the thread.', 'The garden calls again.'
  ],
  firstLight: [
    'First light.', 'The day opens.', 'A fresh row to plant.',
    'Begin gently.', 'The dew is still here.', 'Morning is soil.',
    'Today is unwritten.', 'Arrive before you browse.'
  ]
};

// Tracks recently used words per pool so nothing repeats within 5 uses.
const _used = {};
const REPEAT_WINDOW = 5;

function getWord(pool) {
  const list = WORDS[pool] || [];
  if (list.length === 0) return '';
  if (!_used[pool]) _used[pool] = [];

  const recent = _used[pool];
  const available = list.filter(w => !recent.includes(w));
  const pick = available.length === 0 ? list : available;
  const word = pick[Math.floor(Math.random() * pick.length)];

  recent.push(word);
  // Keep the no-repeat window to the smaller of 5 or (pool size - 1).
  const cap = Math.min(REPEAT_WINDOW, Math.max(0, list.length - 1));
  while (recent.length > cap) recent.shift();

  return word;
}

// Make available both as ES-style globals (for classic <script> includes in
// screens/popup) and as a CommonJS module (for tooling/tests).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WORDS, getWord };
}
