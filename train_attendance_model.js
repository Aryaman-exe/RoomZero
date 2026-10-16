const fs = require('node:fs');

const dataText = fs.readFileSync('data.js', 'utf8');
const match = dataText.match(/window\.ROOMZERO_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
if (!match) throw new Error('Could not read ROOMZERO_DATA from data.js');
const data = JSON.parse(match[1]);
const roomById = new Map(data.rooms.map(room => [room.room_id, room]));
const eventTypes = [...new Set(data.events.map(event => event.event_type))].sort();
const roomTypes = [...new Set(data.rooms.map(room => room.room_type))].sort();

const featureNames = [
  'expected_attendance', 'duration_hours', 'start_hour', 'room_capacity',
  'capacity_minus_expected', 'expected_to_capacity_ratio', 'projector',
  'computers', 'accessible', 'power_outlets',
  ...eventTypes.map(value => `event_type:${value}`),
  ...roomTypes.map(value => `room_type:${value}`),
];

function features(event, room, expectedAttendance = Number(event.expected_attendance),
  duration = Number(event.duration_hours), hour = Number((event.start_time.match(/\s(\d{2}):/) || [])[1] || 0),
  eventType = event.event_type) {
  const capacity = Number(room.capacity);
  return [
    expectedAttendance, duration, hour, capacity, capacity - expectedAttendance,
    expectedAttendance / Math.max(capacity, 1), Number(room.projector),
    Number(room.computers), Number(room.accessible), Number(room.power_outlets),
    ...eventTypes.map(value => Number(eventType === value)),
    ...roomTypes.map(value => Number(room.room_type === value)),
  ];
}

const rows = data.events.flatMap(event => {
  const room = roomById.get(event.room_id);
  const actual = Number(event.actual_attendance);
  if (!room || !Number.isFinite(actual)) return [];
  const numericId = Number((event.event_id.match(/\d+$/) || [])[0] || 0);
  return [{ x: features(event, room), y: Number(actual > Number(room.capacity)),
    expected: Number(event.expected_attendance), capacity: Number(room.capacity),
    split: numericId % 5 === 0 ? 'test' : 'train' }];
});
const training = rows.filter(row => row.split === 'train');
const testing = rows.filter(row => row.split === 'test');
if (training.length < 100 || testing.length < 20) throw new Error('Not enough joined event records');

const means = featureNames.map((_, j) => training.reduce((sum, row) => sum + row.x[j], 0) / training.length);
const scales = featureNames.map((_, j) => {
  const variance = training.reduce((sum, row) => sum + (row.x[j] - means[j]) ** 2, 0) / training.length;
  return Math.sqrt(variance) || 1;
});
const weights = Array(featureNames.length + 1).fill(0);
const learningRate = 0.05;
const epochs = 1200;
const l2 = 0.01;
const sigmoid = value => 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, value))));

// Multivariable logistic regression trained from scratch using batch gradient descent.
for (let epoch = 0; epoch < epochs; epoch++) {
  const gradient = Array(weights.length).fill(0);
  for (const row of training) {
    let logit = weights[0];
    for (let j = 0; j < row.x.length; j++) logit += weights[j + 1] * ((row.x[j] - means[j]) / scales[j]);
    const error = sigmoid(logit) - row.y;
    gradient[0] += error;
    for (let j = 0; j < row.x.length; j++) gradient[j + 1] += error * ((row.x[j] - means[j]) / scales[j]);
  }
  for (let j = 0; j < weights.length; j++) {
    const penalty = j === 0 ? 0 : l2 * training.length * weights[j];
    weights[j] -= learningRate * (gradient[j] + penalty) / training.length;
  }
}

function probability(vector) {
  let logit = weights[0];
  for (let j = 0; j < vector.length; j++) logit += weights[j + 1] * ((vector[j] - means[j]) / scales[j]);
  return sigmoid(logit);
}
function score(rowsToScore, predictor) {
  let tp = 0, fp = 0, fn = 0, tn = 0, brier = 0;
  for (const row of rowsToScore) {
    const p = predictor(row);
    const predicted = p >= 0.5;
    if (predicted && row.y) tp++;
    else if (predicted) fp++;
    else if (row.y) fn++;
    else tn++;
    brier += (p - row.y) ** 2;
  }
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  return {
    accuracy: Number(((tp + tn) / rowsToScore.length).toFixed(4)),
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number((2 * precision * recall / Math.max(precision + recall, 1e-9)).toFixed(4)),
    brier: Number((brier / rowsToScore.length).toFixed(4)),
  };
}
const modelMetrics = score(testing, row => probability(row.x));
const expectedRuleMetrics = score(testing, row => Number(row.expected > row.capacity));
const safeRoomBaselineMetrics = score(testing, () => 0);

const model = {
  version: 1,
  method: 'multivariable logistic regression trained from scratch with batch gradient descent',
  target: 'actual_attendance > room.capacity',
  features: featureNames,
  eventTypes,
  roomTypes,
  means,
  scales,
  weights,
  threshold: 0.5,
  trainingRows: training.length,
  testRows: testing.length,
  split: 'Event IDs ending in 0, 5: test set; all others: training set',
  metrics: {
    model: modelMetrics,
    expectedHeadcountRule: expectedRuleMetrics,
    alwaysNoOverflow: safeRoomBaselineMetrics,
  },
};

fs.writeFileSync('attendance_model.js', `window.ROOMZERO_ATTENDANCE_MODEL = ${JSON.stringify(model)};\n`);
console.log(JSON.stringify({
  joinedEvents: rows.length,
  trainingEvents: training.length,
  testEvents: testing.length,
  model: modelMetrics,
  expectedHeadcountRule: expectedRuleMetrics,
  alwaysNoOverflow: safeRoomBaselineMetrics,
}, null, 2));
