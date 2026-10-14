"use strict";

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 820;
const HEAD_RADIUS = 61.1;
const MIN_OUTPUT_SIZE = 64;
const MAX_OUTPUT_SIZE = 4096;
const MAX_COORDINATE = 100000;
const MAX_HISTORY = 100;
const LABEL_HEIGHT = 20;
const LABEL_DISTANCES = [15, 30, 45];
const POSE_DATA_VERSION = 1;
const POSE_STORAGE_KEY = "chatgpt-pose-reference-tool.saved-poses.v1";
const POSE_EXPORT_APP = "ChatGPTPoseReferenceTool";
const MAX_POSE_IMPORT_LENGTH = 500000;

const partDefinitions = {
  head: { label: "頭部", color: "#ffd84a" },
  torso: { label: "胴体", color: "#747c82" },
  rightArm: { label: "右腕", color: "#347cc1" },
  leftArm: { label: "左腕", color: "#e4514d" },
  rightLeg: { label: "右脚", color: "#45a55b" },
  leftLeg: { label: "左脚", color: "#8757b5" }
};

const initialJoints = {
  head:       { x: 360,   y: -1,    label: "Head",       name: "頭",       part: "head" },
  neck:       { x: 360,   y: 104.3, label: "Neck",       name: "首",       part: "torso" },
  rShoulder:  { x: 253.4, y: 158.9, label: "R-Shoulder", name: "右肩",     part: "rightArm" },
  rElbow:     { x: 201.4, y: 314.9, label: "R-Elbow",    name: "右肘",     part: "rightArm" },
  rWrist:     { x: 178,   y: 470.9, label: "R-Wrist",    name: "右手首",   part: "rightArm" },
  lShoulder:  { x: 466.6, y: 158.9, label: "L-Shoulder", name: "左肩",     part: "leftArm" },
  lElbow:     { x: 518.6, y: 314.9, label: "L-Elbow",    name: "左肘",     part: "leftArm" },
  lWrist:     { x: 542,   y: 470.9, label: "L-Wrist",    name: "左手首",   part: "leftArm" },
  chest:      { x: 360,   y: 243.4, label: "Chest",      name: "胸",       part: "torso" },
  waist:      { x: 360,   y: 402,   label: "Waist",      name: "腰",       part: "torso" },
  rHip:       { x: 308,   y: 448.8, label: "R-Hip",      name: "右股関節", part: "rightLeg" },
  rKnee:      { x: 295,   y: 636,   label: "R-Knee",     name: "右膝",     part: "rightLeg" },
  rAnkle:     { x: 284.6, y: 825.8, label: "R-Ankle",    name: "右足首",   part: "rightLeg" },
  lHip:       { x: 412,   y: 448.8, label: "L-Hip",      name: "左股関節", part: "leftLeg" },
  lKnee:      { x: 425,   y: 636,   label: "L-Knee",     name: "左膝",     part: "leftLeg" },
  lAnkle:     { x: 435.4, y: 825.8, label: "L-Ankle",    name: "左足首",   part: "leftLeg" }
};

const torsoBones = [
  { a: "neck", b: "chest", part: "torso" },
  { a: "chest", b: "waist", part: "torso" },
  { a: "neck", b: "rShoulder", part: "torso" },
  { a: "neck", b: "lShoulder", part: "torso" },
  { a: "waist", b: "rHip", part: "torso" },
  { a: "waist", b: "lHip", part: "torso" },
  { a: "rHip", b: "lHip", part: "torso" }
];

const limbSlotDefinitions = {
  rightArmSlot: { type: "arm", anchorKey: "rShoulder", baseMiddleKey: "rElbow", baseEndKey: "rWrist", initialPart: "rightArm" },
  leftArmSlot: { type: "arm", anchorKey: "lShoulder", baseMiddleKey: "lElbow", baseEndKey: "lWrist", initialPart: "leftArm" },
  rightLegSlot: { type: "leg", anchorKey: "rHip", baseMiddleKey: "rKnee", baseEndKey: "rAnkle", initialPart: "rightLeg" },
  leftLegSlot: { type: "leg", anchorKey: "lHip", baseMiddleKey: "lKnee", baseEndKey: "lAnkle", initialPart: "leftLeg" }
};

const armSlots = ["rightArmSlot", "leftArmSlot"];
const legSlots = ["rightLegSlot", "leftLegSlot"];
const allLimbSlots = [...armSlots, ...legSlots];

function createInitialLimbs() {
  return allLimbSlots.map(slot => {
    const definition = limbSlotDefinitions[slot];
    return {
      id: `${slot}-1`, slot, type: definition.type, index: 1,
      middleKey: definition.baseMiddleKey, endKey: definition.baseEndKey,
      present: true, proximalVisible: true, distalVisible: true, depth: "front"
    };
  });
}
const state = {
  joints: cloneJoints(initialJoints),
  colors: Object.fromEntries(Object.entries(partDefinitions).map(([key, value]) => [key, value.color])),
  limbs: createInitialLimbs(),
  labelVisibility: Object.fromEntries(Object.values(initialJoints).map(joint => [joint.label, true])),
  linkedMove: false,
  symmetricMove: false,
  moveWhole: false,
  rotatePose: false,
  rotationSession: null,
  rotationDrag: null,
  poseBlack: false,
  skeletonScale: 1,
  outputSize: { width: 1024, height: 1536 },
  symmetryAxisX: DESIGN_WIDTH / 2,
  selectedJoint: null,
  dragAction: null,
  lastDragPoint: null,
  reference: {
    image: null,
    url: null,
    visible: true,
    editing: false,
    opacity: 0.45,
    scale: 1,
    x: DESIGN_WIDTH / 2,
    y: DESIGN_HEIGHT / 2
  },
  labelPlacements: {},
  savedPoses: [null, null, null],
  undoStack: [],
  redoStack: [],
  historyStart: null
};

const canvas = document.getElementById("poseCanvas");
const canvasStage = document.getElementById("canvasStage");
const canvasFrame = document.getElementById("canvasFrame");
const ctx = canvas.getContext("2d");
const promptOutput = document.getElementById("promptOutput");
const toast = document.getElementById("toast");
let toastTimer = null;

function cloneJoints(source) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, { ...value }]));
}

function cloneLimbs(source) {
  return source.map(limb => ({ ...limb }));
}

function getSlotPart(slot) {
  return state.joints[limbSlotDefinitions[slot].anchorKey].part;
}

function getLimbDisplayName(limb) {
  const base = partDefinitions[getSlotPart(limb.slot)].label;
  return `${base}${limb.index === 1 ? "" : limb.index}`;
}

function getLimbByJointKey(key) {
  return state.limbs.find(limb => limb.middleKey === key || limb.endKey === key) || null;
}

function getLimbForSemanticPart(part, index = 1) {
  return state.limbs.find(limb => limb.present && getSlotPart(limb.slot) === part && limb.index === index) || null;
}

function getPresentLimbs(slot = null) {
  return state.limbs.filter(limb => limb.present && (!slot || limb.slot === slot));
}

function semanticLimbExists(part) {
  return state.limbs.some(limb => limb.present && getSlotPart(limb.slot) === part);
}

function oppositeLimbPart(part) {
  return ({ rightArm: "leftArm", leftArm: "rightArm", rightLeg: "leftLeg", leftLeg: "rightLeg" })[part] || null;
}

function getPairedJointKey(key) {
  const anchorSlot = allLimbSlots.find(slot => limbSlotDefinitions[slot].anchorKey === key);
  if (anchorSlot) {
    const oppositePart = oppositeLimbPart(getSlotPart(anchorSlot));
    const oppositeSlot = allLimbSlots.find(slot => getSlotPart(slot) === oppositePart);
    return oppositeSlot ? limbSlotDefinitions[oppositeSlot].anchorKey : null;
  }
  const limb = getLimbByJointKey(key);
  if (!limb) return null;
  const opposite = getLimbForSemanticPart(oppositeLimbPart(getSlotPart(limb.slot)), limb.index);
  if (!opposite) return null;
  return key === limb.middleKey ? opposite.middleKey : opposite.endKey;
}

function ensureLabelVisibility() {
  Object.values(state.joints).forEach(joint => {
    if (!(joint.label in state.labelVisibility)) state.labelVisibility[joint.label] = true;
  });
}

function capturePoseSnapshot() {
  return {
    joints: cloneJoints(state.joints),
    limbs: cloneLimbs(state.limbs),
    labelVisibility: { ...state.labelVisibility },
    symmetryAxisX: state.symmetryAxisX,
    skeletonScale: state.skeletonScale
  };
}

function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function beginHistoryTransaction() {
  if (!state.historyStart) state.historyStart = capturePoseSnapshot();
}

function commitHistoryTransaction() {
  if (!state.historyStart) return;
  const before = state.historyStart;
  state.historyStart = null;
  if (snapshotsEqual(before, capturePoseSnapshot())) return;
  state.undoStack.push(before);
  if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
  state.redoStack.length = 0;
  updateHistoryButtons();
}

function restorePoseSnapshot(snapshot) {
  state.joints = cloneJoints(snapshot.joints);
  state.limbs = cloneLimbs(snapshot.limbs);
  state.labelVisibility = { ...snapshot.labelVisibility };
  state.symmetryAxisX = snapshot.symmetryAxisX;
  state.skeletonScale = snapshot.skeletonScale;
  state.labelPlacements = {};
  state.selectedJoint = null;
  document.getElementById("skeletonScale").value = String(Math.round(state.skeletonScale * 100));
  document.getElementById("skeletonScaleValue").value = `${Math.round(state.skeletonScale * 100)}%`;
  rebuildAllDynamicControls();
  updateCoordinateControls();
  updateModeUi();
  render();
  updatePrompt();
}

function getStoredLimbKeys(slot, index) {
  const definition = limbSlotDefinitions[slot];
  return index === 1
    ? { middleKey: definition.baseMiddleKey, endKey: definition.baseEndKey }
    : { middleKey: `${slot}Middle${index}`, endKey: `${slot}End${index}` };
}

function captureStoredPoseData() {
  return normalizeStoredPoseData({
    pose: {
      joints: Object.fromEntries(Object.entries(state.joints).map(([key, joint]) => [key, { x: joint.x, y: joint.y }])),
      limbs: state.limbs.map(limb => ({
        slot: limb.slot,
        type: limb.type,
        index: limb.index,
        present: limb.present,
        proximalVisible: limb.proximalVisible,
        distalVisible: limb.distalVisible,
        depth: limb.depth
      })),
      slotParts: Object.fromEntries(allLimbSlots.map(slot => [slot, getSlotPart(slot)])),
      labelVisibility: { ...state.labelVisibility },
      symmetryAxisX: state.symmetryAxisX,
      skeletonScale: state.skeletonScale
    },
    output: {
      width: state.outputSize.width,
      height: state.outputSize.height,
      background: document.getElementById("exportBackground").value,
      exportLabels: document.getElementById("exportLabels").checked,
      poseBlack: state.poseBlack
    }
  });
}

function normalizeStoredPoseData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawPose = value.pose;
  const rawOutput = value.output;
  if (!rawPose || typeof rawPose !== "object" || !rawOutput || typeof rawOutput !== "object") return null;
  if (!Array.isArray(rawPose.limbs) || rawPose.limbs.length < 4 || rawPose.limbs.length > 16) return null;

  const seenLimbs = new Set();
  const limbs = [];
  for (const raw of rawPose.limbs) {
    if (!raw || typeof raw !== "object" || !allLimbSlots.includes(raw.slot)) return null;
    const index = Number(raw.index);
    const definition = limbSlotDefinitions[raw.slot];
    const key = `${raw.slot}-${index}`;
    if (!Number.isInteger(index) || index < 1 || index > 4 || seenLimbs.has(key)) return null;
    if ([raw.present, raw.proximalVisible, raw.distalVisible].some(item => typeof item !== "boolean")) return null;
    if (!['front', 'back'].includes(raw.depth)) return null;
    const keys = getStoredLimbKeys(raw.slot, index);
    seenLimbs.add(key);
    limbs.push({
      id: key,
      slot: raw.slot,
      type: definition.type,
      index,
      middleKey: keys.middleKey,
      endKey: keys.endKey,
      present: raw.present,
      proximalVisible: raw.proximalVisible,
      distalVisible: raw.distalVisible,
      depth: raw.depth
    });
  }
  if (allLimbSlots.some(slot => !seenLimbs.has(`${slot}-1`))) return null;
  limbs.sort((a, b) => allLimbSlots.indexOf(a.slot) - allLimbSlots.indexOf(b.slot) || a.index - b.index);

  const rawSlotParts = rawPose.slotParts;
  if (!rawSlotParts || typeof rawSlotParts !== "object") return null;
  const slotParts = {};
  for (const slot of allLimbSlots) {
    const part = rawSlotParts[slot];
    const allowed = limbSlotDefinitions[slot].type === "arm" ? ["rightArm", "leftArm"] : ["rightLeg", "leftLeg"];
    if (!allowed.includes(part)) return null;
    slotParts[slot] = part;
  }
  if (new Set(armSlots.map(slot => slotParts[slot])).size !== 2 || new Set(legSlots.map(slot => slotParts[slot])).size !== 2) return null;

  const rawJoints = rawPose.joints;
  if (!rawJoints || typeof rawJoints !== "object" || Array.isArray(rawJoints)) return null;
  const jointKeys = new Set(Object.keys(initialJoints));
  limbs.forEach(limb => {
    jointKeys.add(limb.middleKey);
    jointKeys.add(limb.endKey);
  });
  const joints = {};
  for (const key of jointKeys) {
    const joint = rawJoints[key];
    if (!joint || typeof joint !== "object") return null;
    const x = Number(joint.x);
    const y = Number(joint.y);
    if (![x, y].every(number => Number.isFinite(number) && Math.abs(number) <= 2000000)) return null;
    joints[key] = { x, y };
  }

  const symmetryAxisX = Number(rawPose.symmetryAxisX);
  const skeletonScale = Number(rawPose.skeletonScale);
  if (!Number.isFinite(symmetryAxisX) || Math.abs(symmetryAxisX) > 2000000) return null;
  if (!Number.isFinite(skeletonScale) || skeletonScale < 0.25 || skeletonScale > 3) return null;

  const expectedLabels = new Set(["Head", "Neck", "Chest", "Waist"]);
  allLimbSlots.forEach(slot => {
    const definition = limbSlotDefinitions[slot];
    const right = slotParts[slot].startsWith("right");
    const prefix = right ? "R" : "L";
    expectedLabels.add(`${prefix}-${definition.type === "arm" ? "Shoulder" : "Hip"}`);
    limbs.filter(limb => limb.slot === slot).forEach(limb => {
      const suffix = limb.index === 1 ? "" : String(limb.index);
      expectedLabels.add(`${prefix}-${definition.type === "arm" ? "Elbow" : "Knee"}${suffix}`);
      expectedLabels.add(`${prefix}-${definition.type === "arm" ? "Wrist" : "Ankle"}${suffix}`);
    });
  });
  const rawVisibility = rawPose.labelVisibility;
  if (!rawVisibility || typeof rawVisibility !== "object" || Array.isArray(rawVisibility)) return null;
  const labelVisibility = {};
  for (const label of expectedLabels) {
    if (label in rawVisibility && typeof rawVisibility[label] !== "boolean") return null;
    labelVisibility[label] = rawVisibility[label] !== false;
  }

  const width = Number(rawOutput.width);
  const height = Number(rawOutput.height);
  if (![width, height].every(number => Number.isInteger(number) && number >= MIN_OUTPUT_SIZE && number <= MAX_OUTPUT_SIZE)) return null;
  if (!["white", "black", "transparent"].includes(rawOutput.background)) return null;
  if (typeof rawOutput.exportLabels !== "boolean" || typeof rawOutput.poseBlack !== "boolean") return null;

  return {
    pose: { joints, limbs, slotParts, labelVisibility, symmetryAxisX, skeletonScale },
    output: {
      width,
      height,
      background: rawOutput.poseBlack && rawOutput.background === "black" ? "white" : rawOutput.background,
      exportLabels: rawOutput.exportLabels,
      poseBlack: rawOutput.poseBlack
    }
  };
}

function restoreStoredPoseData(value) {
  const data = normalizeStoredPoseData(value);
  if (!data) return false;
  state.rotatePose = false;
  state.rotationSession = null;
  state.rotationDrag = null;
  state.linkedMove = false;
  state.symmetricMove = false;
  state.moveWhole = false;
  state.reference.editing = false;
  state.dragAction = null;
  state.lastDragPoint = null;
  state.selectedJoint = null;
  canvas.classList.remove("dragging");

  state.joints = cloneJoints(initialJoints);
  state.limbs = createInitialLimbs();
  data.pose.limbs.filter(limb => limb.index > 1).forEach(limb => ensureLimbRecord(limb.slot, limb.index));
  data.pose.limbs.forEach(saved => {
    const limb = state.limbs.find(item => item.slot === saved.slot && item.index === saved.index);
    limb.present = saved.present;
    limb.proximalVisible = saved.proximalVisible;
    limb.distalVisible = saved.distalVisible;
    limb.depth = saved.depth;
  });
  allLimbSlots.forEach(slot => setSlotSemantic(slot, data.pose.slotParts[slot]));
  Object.entries(data.pose.joints).forEach(([key, point]) => {
    state.joints[key].x = point.x;
    state.joints[key].y = point.y;
  });
  state.labelVisibility = { ...data.pose.labelVisibility };
  state.symmetryAxisX = data.pose.symmetryAxisX;
  state.skeletonScale = data.pose.skeletonScale;
  state.outputSize = { width: data.output.width, height: data.output.height };
  state.poseBlack = data.output.poseBlack;
  state.labelPlacements = {};
  state.historyStart = null;
  state.undoStack.length = 0;
  state.redoStack.length = 0;

  document.getElementById("linkedMove").checked = false;
  document.getElementById("symmetricMove").checked = false;
  document.getElementById("moveWhole").checked = false;
  document.getElementById("rotatePose").checked = false;
  document.getElementById("rotationAngle").value = "0";
  document.getElementById("editReferenceImage").checked = false;
  document.getElementById("skeletonScale").value = String(Math.round(state.skeletonScale * 100));
  document.getElementById("skeletonScaleValue").value = `${Math.round(state.skeletonScale * 100)}%`;
  document.getElementById("exportBackground").value = data.output.background;
  document.getElementById("exportLabels").checked = data.output.exportLabels;
  document.getElementById("poseBlack").checked = data.output.poseBlack;

  const sizeSelect = document.getElementById("exportSize");
  const preset = `${data.output.width}x${data.output.height}`;
  const presetExists = Array.from(sizeSelect.options).some(option => option.value === preset);
  sizeSelect.value = presetExists ? preset : "custom";
  document.getElementById("customSizeFields").hidden = presetExists;
  document.getElementById("customWidth").value = String(data.output.width);
  document.getElementById("customHeight").value = String(data.output.height);

  rebuildAllDynamicControls();
  updateStageAspect();
  updateCoordinateControls();
  updateReferenceControls();
  updatePoseBlackUi();
  updateModeUi();
  updateHistoryButtons();
  render();
  updatePrompt();
  requestAnimationFrame(resizeCanvas);
  return true;
}

function serializeStoredPose(data) {
  return JSON.stringify({ app: POSE_EXPORT_APP, version: POSE_DATA_VERSION, data });
}

function parseStoredPose(text) {
  if (!text || text.length > MAX_POSE_IMPORT_LENGTH) return null;
  try {
    const envelope = JSON.parse(text);
    if (!envelope || envelope.app !== POSE_EXPORT_APP || envelope.version !== POSE_DATA_VERSION) return null;
    return normalizeStoredPoseData(envelope.data);
  } catch (error) {
    return null;
  }
}

function loadSavedPosesFromBrowser() {
  try {
    const raw = window.localStorage.getItem(POSE_STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (!stored || stored.version !== POSE_DATA_VERSION || !Array.isArray(stored.slots)) return;
    state.savedPoses = [0, 1, 2].map(index => stored.slots[index] ? normalizeStoredPoseData(stored.slots[index]) : null);
  } catch (error) {
    state.savedPoses = [null, null, null];
  }
}

function persistSavedPoses() {
  try {
    window.localStorage.setItem(POSE_STORAGE_KEY, JSON.stringify({ version: POSE_DATA_VERSION, slots: state.savedPoses }));
    return true;
  } catch (error) {
    return false;
  }
}

function updatePoseStorageUi() {
  for (let slot = 1; slot <= 3; slot += 1) {
    const saved = Boolean(state.savedPoses[slot - 1]);
    const saveButton = document.querySelector(`[data-save-pose="${slot}"]`);
    const loadButton = document.querySelector(`[data-load-pose="${slot}"]`);
    if (saveButton) {
      saveButton.classList.toggle("is-saved", saved);
      saveButton.title = saved ? `ポーズ${slot}は保存済みです。クリックすると上書きします` : `現在の状態をポーズ${slot}に保存します`;
    }
    if (loadButton) loadButton.disabled = !saved;
  }
}

function savePoseToSlot(slot) {
  const index = slot - 1;
  if (index < 0 || index >= state.savedPoses.length) return;
  if (state.savedPoses[index] && !window.confirm(`ポーズ${slot}のセーブデータを上書きしますか？`)) return;
  state.savedPoses[index] = captureStoredPoseData();
  const persisted = persistSavedPoses();
  updatePoseStorageUi();
  showToast(persisted ? `ポーズ${slot}にセーブしました` : `ポーズ${slot}に一時保存しました。ブラウザ終了後は保持されない可能性があります`);
}

function loadPoseFromSlot(slot) {
  const data = state.savedPoses[slot - 1];
  if (!data) return;
  if (!window.confirm(`現在の編集状況を破棄して、ポーズ${slot}をロードしますか？`)) return;
  if (restoreStoredPoseData(data)) showToast(`ポーズ${slot}をロードしました`);
}

async function copyText(text, fallbackElement) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    fallbackElement.focus();
    fallbackElement.select();
    return document.execCommand("copy");
  }
}

async function exportCurrentPose() {
  const output = document.getElementById("poseExportOutput");
  const text = serializeStoredPose(captureStoredPoseData());
  output.value = text;
  document.getElementById("poseExportGroup").hidden = false;
  const copied = await copyText(text, output);
  showToast(copied ? "ポーズ文字列を出力してコピーしました" : "ポーズ文字列を出力しました。手動でコピーしてください");
}

function importPoseFromText() {
  const input = document.getElementById("poseImportInput");
  const data = parseStoredPose(input.value.trim());
  if (!data) {
    showToast("有効なポーズ文字列ではありません");
    return;
  }
  if (!window.confirm("現在の編集状況を破棄して、入力したポーズをインポートしますか？")) return;
  if (restoreStoredPoseData(data)) showToast("ポーズをインポートしました");
}

function undoPose() {
  if (state.rotatePose) exitRotationMode();
  if (state.historyStart) commitHistoryTransaction();
  if (!state.undoStack.length) return;
  state.redoStack.push(capturePoseSnapshot());
  restorePoseSnapshot(state.undoStack.pop());
  updateHistoryButtons();
  showToast("操作を戻しました");
}

function redoPose() {
  if (state.rotatePose) exitRotationMode();
  if (state.historyStart) commitHistoryTransaction();
  if (!state.redoStack.length) return;
  state.undoStack.push(capturePoseSnapshot());
  restorePoseSnapshot(state.redoStack.pop());
  updateHistoryButtons();
  showToast("操作を進めました");
}

function updateHistoryButtons() {
  document.getElementById("undoButton").disabled = state.undoStack.length === 0;
  document.getElementById("redoButton").disabled = state.redoStack.length === 0;
}

function getOutputSize() {
  return { ...state.outputSize };
}

function getFrameTransform(width, height) {
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  return { scale, offsetX: (width - DESIGN_WIDTH * scale) / 2, offsetY: (height - DESIGN_HEIGHT * scale) / 2 };
}

function internalToOutput(point) {
  const { width, height } = getOutputSize();
  const transform = getFrameTransform(width, height);
  return { x: transform.offsetX + point.x * transform.scale, y: transform.offsetY + point.y * transform.scale };
}

function outputToInternal(point) {
  const { width, height } = getOutputSize();
  const transform = getFrameTransform(width, height);
  return { x: (point.x - transform.offsetX) / transform.scale, y: (point.y - transform.offsetY) / transform.scale };
}

function getVisibleFrameBounds() {
  const { width, height } = getOutputSize();
  const transform = getFrameTransform(width, height);
  return {
    left: -transform.offsetX / transform.scale,
    top: -transform.offsetY / transform.scale,
    right: (width - transform.offsetX) / transform.scale,
    bottom: (height - transform.offsetY) / transform.scale
  };
}

function formatCoordinate(value) {
  return String(Math.round(value * 10) / 10);
}

function formatIntegerCoordinate(value) {
  return String(Math.round(value));
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized.length === 3 ? normalized.split("").map(c => c + c).join("") : normalized, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function contrastColor(background) {
  return background === "black" ? "#f5f5f2" : "#1e292d";
}

function initializeControls() {
  rebuildAllDynamicControls();

  updateStageAspect();
  updateCoordinateControls();
  updateReferenceControls();
  updateModeUi();
  updateHistoryButtons();
  updatePoseBlackUi();
  updatePoseStorageUi();
}

function rebuildAllDynamicControls() {
  ensureLabelVisibility();
  rebuildJointControls();
  rebuildDepthControls();
  rebuildLimbControls();
  updateAddLimbButtons();
}

function getJointControlRows() {
  const rows = [["head"], ["neck"], ["rShoulder", "lShoulder"]];
  for (let index = 1; index <= 4; index += 1) {
    const pair = armSlots.map(slot => state.limbs.find(limb => limb.slot === slot && limb.index === index && limb.present) || null);
    if (pair.some(Boolean)) {
      rows.push(pair.map(limb => limb?.middleKey || null));
      rows.push(pair.map(limb => limb?.endKey || null));
    }
  }
  rows.push(["chest"], ["waist"], ["rHip", "lHip"]);
  for (let index = 1; index <= 4; index += 1) {
    const pair = legSlots.map(slot => state.limbs.find(limb => limb.slot === slot && limb.index === index && limb.present) || null);
    if (pair.some(Boolean)) {
      rows.push(pair.map(limb => limb?.middleKey || null));
      rows.push(pair.map(limb => limb?.endKey || null));
    }
  }
  return rows;
}

function rebuildJointControls() {
  const labelContainer = document.getElementById("labelControls");
  const coordinateContainer = document.getElementById("coordinateControls");
  labelContainer.replaceChildren();
  coordinateContainer.replaceChildren();
  getJointControlRows().forEach(keyRow => {
    keyRow.forEach(key => {
      const isFullWidth = keyRow.length === 1;
      if (!key || !state.joints[key]) {
        const coordinatePlaceholder = document.createElement("div");
        coordinatePlaceholder.className = "grid-placeholder";
        coordinateContainer.appendChild(coordinatePlaceholder);
        const labelPlaceholder = document.createElement("div");
        labelPlaceholder.className = "grid-placeholder";
        labelContainer.appendChild(labelPlaceholder);
        return;
      }
      const joint = state.joints[key];
      const label = document.createElement("label");
      label.className = `label-option${isFullWidth ? " label-option-full" : ""}`;
      label.innerHTML = `<input type="checkbox" data-label-joint="${key}"${state.labelVisibility[joint.label] ? " checked" : ""}><span>${joint.label}</span>`;
      labelContainer.appendChild(label);

      const row = document.createElement("div");
      const colored = joint.part !== "torso";
      row.className = `coordinate-row${isFullWidth ? " coordinate-row-full" : ""}${colored ? " coordinate-row-colored" : ""}`;
      if (colored) row.style.setProperty("--coordinate-part-color", state.colors[joint.part]);
      row.innerHTML = `<div class="coordinate-name"><b>${joint.name}(${joint.label})</b></div><div class="coordinate-fields"><label>X<input type="number" step="1" inputmode="numeric" data-coordinate-joint="${key}" data-coordinate-axis="x" aria-label="${joint.name}のX座標"></label><label>Y<input type="number" step="1" inputmode="numeric" data-coordinate-joint="${key}" data-coordinate-axis="y" aria-label="${joint.name}のY座標"></label></div>`;
      coordinateContainer.appendChild(row);
    });
  });
  requestAnimationFrame(syncCoordinateListToCanvas);
}

function rebuildDepthControls() {
  const container = document.getElementById("depthControls");
  container.replaceChildren();
  [armSlots, legSlots].forEach(slots => {
    for (let index = 1; index <= 4; index += 1) {
      const pair = slots.map(slot => state.limbs.find(item => item.slot === slot && item.index === index && item.present) || null);
      if (!pair.some(Boolean)) continue;
      pair.forEach(limb => {
        if (!limb) {
          const placeholder = document.createElement("div");
          placeholder.className = "grid-placeholder";
          container.appendChild(placeholder);
          return;
        }
        const label = document.createElement("label");
        label.className = "depth-control depth-control-colored";
        label.style.setProperty("--depth-part-color", state.colors[getSlotPart(limb.slot)]);
        const name = getLimbDisplayName(limb);
        label.innerHTML = `<b>${name}</b><select data-depth-limb="${limb.id}" aria-label="${name}の前後関係"><option value="front"${limb.depth === "front" ? " selected" : ""}>手前</option><option value="back"${limb.depth === "back" ? " selected" : ""}>奥</option></select>`;
        container.appendChild(label);
      });
    }
  });
}

function rebuildLimbControls() {
  const container = document.getElementById("limbControls");
  container.replaceChildren();
  [armSlots, legSlots].forEach(slots => {
    for (let index = 1; index <= 4; index += 1) {
      const pair = slots.map(slot => state.limbs.find(limb => limb.slot === slot && limb.index === index && limb.present) || null);
      if (!pair.some(Boolean)) continue;
      pair.forEach(limb => {
        if (!limb) {
          const placeholder = document.createElement("div");
          placeholder.className = "grid-placeholder";
          container.appendChild(placeholder);
          return;
        }
        const control = document.createElement("div");
        control.className = "limb-control limb-control-colored";
        control.style.setProperty("--limb-part-color", state.colors[getSlotPart(limb.slot)]);
        const proximalName = limb.type === "arm" ? "上腕" : "腿";
        const distalName = limb.type === "arm" ? "前腕" : "脛";
        control.innerHTML = `<div class="limb-control-header"><span>${getLimbDisplayName(limb)}:</span><button class="limb-remove" type="button" data-remove-limb="${limb.id}" aria-label="${getLimbDisplayName(limb)}を削除">×</button></div><div class="limb-segments"><label class="segment-toggle"><input type="checkbox" data-limb-segment="distal" data-limb-id="${limb.id}"${limb.distalVisible ? " checked" : ""}><span>${distalName}</span></label><label class="segment-toggle"><input type="checkbox" data-limb-segment="proximal" data-limb-id="${limb.id}"${limb.proximalVisible ? " checked" : ""}><span>${proximalName}</span></label></div>`;
        container.appendChild(control);
      });
    }
  });
}

function updateAddLimbButtons() {
  document.querySelectorAll("[data-add-limb]").forEach(button => {
    const part = button.dataset.addLimb;
    button.disabled = state.limbs.filter(limb => limb.present && getSlotPart(limb.slot) === part).length >= 4 || state.rotatePose;
    const slot = allLimbSlots.find(candidate => getSlotPart(candidate) === part);
    const slots = part.endsWith("Arm") ? armSlots : legSlots;
    const rowOffset = part.endsWith("Arm") ? 0 : 2;
    button.style.order = String(rowOffset + slots.indexOf(slot) + 1);
  });
}

function bindEvents() {
  const appShell = document.querySelector(".app-shell");
  const coordinatesPanel = document.getElementById("coordinatesPanel");
  const showCoordinatesButton = document.getElementById("showCoordinatesButton");
  const hideCoordinatesButton = document.getElementById("hideCoordinatesButton");
  const setCoordinatesCollapsed = collapsed => {
    coordinatesPanel.hidden = collapsed;
    appShell.classList.toggle("coordinates-collapsed", collapsed);
    showCoordinatesButton.hidden = !collapsed;
    showCoordinatesButton.setAttribute("aria-expanded", String(!collapsed));
    requestAnimationFrame(() => {
      resizeCanvas();
      (collapsed ? showCoordinatesButton : hideCoordinatesButton).focus();
    });
  };
  hideCoordinatesButton.addEventListener("click", () => setCoordinatesCollapsed(true));
  showCoordinatesButton.addEventListener("click", () => setCoordinatesCollapsed(false));

  const helpModal = document.getElementById("helpModal");
  const closeHelp = () => { helpModal.hidden = true; };
  document.getElementById("helpButton").addEventListener("click", () => { helpModal.hidden = false; });
  document.getElementById("closeHelpButton").addEventListener("click", closeHelp);
  helpModal.addEventListener("click", event => { if (event.target === helpModal) closeHelp(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !helpModal.hidden) closeHelp(); });

  document.getElementById("depthControls").addEventListener("change", event => {
    const limb = state.limbs.find(item => item.id === event.target.dataset.depthLimb);
    if (!limb) return;
    beginHistoryTransaction();
    limb.depth = event.target.value;
    render();
    updatePrompt();
    commitHistoryTransaction();
  });
  document.getElementById("labelControls").addEventListener("change", event => {
    const key = event.target.dataset.labelJoint;
    if (!key) return;
    state.labelVisibility[state.joints[key].label] = event.target.checked;
    render();
    updatePrompt();
  });
  document.getElementById("showAllLabels").addEventListener("click", () => setAllLabels(true));
  document.getElementById("hideAllLabels").addEventListener("click", () => setAllLabels(false));

  document.getElementById("linkedMove").addEventListener("change", event => {
    state.linkedMove = event.target.checked;
    if (state.linkedMove) {
      state.symmetricMove = false;
      document.getElementById("symmetricMove").checked = false;
    }
    updateModeUi();
  });
  document.getElementById("symmetricMove").addEventListener("change", event => {
    state.symmetricMove = event.target.checked;
    if (state.symmetricMove) {
      state.linkedMove = false;
      document.getElementById("linkedMove").checked = false;
    }
    updateModeUi();
  });
  document.getElementById("moveWhole").addEventListener("change", event => {
    if (state.rotatePose) {
      event.target.checked = false;
      return;
    }
    state.moveWhole = event.target.checked;
    if (state.moveWhole) {
      state.reference.editing = false;
      document.getElementById("editReferenceImage").checked = false;
    }
    updateModeUi();
  });
  document.getElementById("rotatePose").addEventListener("change", event => {
    if (event.target.checked) enterRotationMode();
    else exitRotationMode();
  });
  const rotationAngle = document.getElementById("rotationAngle");
  rotationAngle.addEventListener("change", applyRotationAngleInput);
  rotationAngle.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyRotationAngleInput();
    event.target.blur();
  });
  document.getElementById("flipHorizontalButton").addEventListener("click", () => {
    applyInstantPoseOperation(flipJointsHorizontally, "左右反転を実行しました", true);
  });
  document.getElementById("swapSidesButton").addEventListener("click", () => {
    applyInstantPoseOperation(() => swapLimbSemantics(["arm", "leg"]), "左右入替を実行しました", true, true);
  });
  document.getElementById("swapArmsButton").addEventListener("click", () => {
    applyInstantPoseOperation(() => swapLimbSemantics(["arm"]), "腕だけの左右入替を実行しました", true, true);
  });
  document.getElementById("swapLegsButton").addEventListener("click", () => {
    applyInstantPoseOperation(() => swapLimbSemantics(["leg"]), "脚だけの左右入替を実行しました", true, true);
  });
  const skeletonScale = document.getElementById("skeletonScale");
  skeletonScale.addEventListener("pointerdown", beginHistoryTransaction);
  skeletonScale.addEventListener("keydown", beginHistoryTransaction);
  skeletonScale.addEventListener("input", event => applySkeletonScale(Number(event.target.value) / 100));
  skeletonScale.addEventListener("change", commitHistoryTransaction);
  document.getElementById("coordinateControls").addEventListener("change", handleCoordinateChange);
  document.getElementById("coordinateControls").addEventListener("keydown", event => {
    if (event.key !== "Enter" || !event.target.dataset.coordinateJoint) return;
    event.preventDefault();
    handleCoordinateChange(event);
    event.target.blur();
  });

  document.querySelector(".limb-add-actions").addEventListener("click", event => {
    const button = event.target.closest("[data-add-limb]");
    if (button) addLimb(button.dataset.addLimb);
  });
  document.getElementById("limbControls").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-limb]");
    if (button) removeLimb(button.dataset.removeLimb);
  });
  document.getElementById("limbControls").addEventListener("change", handleLimbSegmentChange);

  document.getElementById("referenceImageInput").addEventListener("change", handleReferenceImageLoad);
  document.getElementById("showReferenceImage").addEventListener("change", event => {
    state.reference.visible = event.target.checked;
    render();
  });
  document.getElementById("editReferenceImage").addEventListener("change", event => {
    state.reference.editing = event.target.checked && Boolean(state.reference.image);
    if (state.reference.editing) {
      state.moveWhole = false;
      document.getElementById("moveWhole").checked = false;
    }
    updateModeUi();
  });
  document.getElementById("referenceOpacity").addEventListener("input", event => {
    state.reference.opacity = Number(event.target.value) / 100;
    document.getElementById("referenceOpacityValue").value = `${event.target.value}%`;
    render();
  });
  document.getElementById("referenceScale").addEventListener("input", event => {
    state.reference.scale = Number(event.target.value) / 100;
    document.getElementById("referenceScaleValue").value = `${event.target.value}%`;
    render();
  });
  document.getElementById("referenceX").addEventListener("change", handleReferencePositionChange);
  document.getElementById("referenceY").addEventListener("change", handleReferencePositionChange);
  [document.getElementById("referenceX"), document.getElementById("referenceY")].forEach(input => {
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handleReferencePositionChange();
      event.target.blur();
    });
  });
  document.getElementById("removeReferenceImage").addEventListener("click", removeReferenceImage);

  document.getElementById("resetPoseButton").addEventListener("click", () => {
    if (state.rotatePose) exitRotationMode();
    beginHistoryTransaction();
    resetPoseKeepingLimbComposition();
    commitHistoryTransaction();
    showToast("ポーズを初期化しました");
  });
  document.getElementById("resetAllButton").addEventListener("click", () => {
    const message = "ポーズや各種設定を初期状態に戻します。\nポーズ1～3のセーブデータは削除されません。\n実行しますか？";
    if (window.confirm(message)) window.location.reload();
  });
  document.getElementById("undoButton").addEventListener("click", undoPose);
  document.getElementById("redoButton").addEventListener("click", redoPose);

  document.querySelector(".pose-slot-list").addEventListener("click", event => {
    const saveButton = event.target.closest("[data-save-pose]");
    if (saveButton) {
      savePoseToSlot(Number(saveButton.dataset.savePose));
      return;
    }
    const loadButton = event.target.closest("[data-load-pose]");
    if (loadButton) loadPoseFromSlot(Number(loadButton.dataset.loadPose));
  });
  document.getElementById("exportPoseButton").addEventListener("click", exportCurrentPose);
  document.getElementById("importPoseButton").addEventListener("click", importPoseFromText);

  document.getElementById("exportSize").addEventListener("change", handleOutputSizePresetChange);
  [document.getElementById("customWidth"), document.getElementById("customHeight")].forEach(input => {
    input.addEventListener("change", applyCustomOutputSize);
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyCustomOutputSize();
      event.target.blur();
    });
  });
  document.getElementById("exportLabels").addEventListener("change", updatePrompt);
  document.getElementById("exportBackground").addEventListener("change", event => {
    if (state.poseBlack && event.target.value === "black") {
      event.target.value = "white";
      showToast("ポーズ黒化中は黒背景を使用できません");
    }
  });
  document.getElementById("poseBlack").addEventListener("change", event => {
    state.poseBlack = event.target.checked;
    updatePoseBlackUi();
    render();
    updatePrompt();
  });
  document.getElementById("exportButton").addEventListener("click", exportPng);
  document.getElementById("copyPromptButton").addEventListener("click", copyPrompt);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("dblclick", handleJointDoubleClick);
  document.addEventListener("keydown", handleHistoryShortcut);
  window.addEventListener("resize", resizeCanvas);
  if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(canvasStage);
}

function updateStageAspect() {
  const { width, height } = getOutputSize();
  const ratio = width / height;
  canvasFrame.style.setProperty("--output-ratio", String(ratio));
  canvasStage.style.setProperty("--output-ratio", String(ratio));
  canvasStage.style.aspectRatio = `${width} / ${height}`;
}

function refreshOutputSizeUi() {
  updateStageAspect();
  updateCoordinateControls();
  updateReferenceControls();
  state.labelPlacements = {};
  requestAnimationFrame(resizeCanvas);
}

function handleOutputSizePresetChange(event) {
  const custom = event.target.value === "custom";
  document.getElementById("customSizeFields").hidden = !custom;
  if (custom) {
    document.getElementById("customWidth").value = String(state.outputSize.width);
    document.getElementById("customHeight").value = String(state.outputSize.height);
    refreshOutputSizeUi();
    return;
  }
  const [width, height] = event.target.value.split("x").map(Number);
  state.outputSize = { width, height };
  refreshOutputSizeUi();
}

function applyCustomOutputSize() {
  const widthInput = document.getElementById("customWidth");
  const heightInput = document.getElementById("customHeight");
  const width = Number(widthInput.value);
  const height = Number(heightInput.value);
  const valid = [width, height].every(value => Number.isInteger(value) && value >= MIN_OUTPUT_SIZE && value <= MAX_OUTPUT_SIZE);
  if (!valid) {
    widthInput.value = String(state.outputSize.width);
    heightInput.value = String(state.outputSize.height);
    showToast(`幅と高さは${MIN_OUTPUT_SIZE}～${MAX_OUTPUT_SIZE}の整数で入力してください`);
    return;
  }
  state.outputSize = { width, height };
  refreshOutputSizeUi();
}

function applySkeletonScale(nextScale) {
  if (!Number.isFinite(nextScale) || nextScale < 0.25 || nextScale > 3) return;
  beginHistoryTransaction();
  const ratio = nextScale / state.skeletonScale;
  if (ratio === 1) return;
  const center = { x: state.symmetryAxisX, y: state.joints.waist.y };
  Object.values(state.joints).forEach(joint => {
    joint.x = center.x + (joint.x - center.x) * ratio;
    joint.y = center.y + (joint.y - center.y) * ratio;
  });
  state.skeletonScale = nextScale;
  state.labelPlacements = {};
  document.getElementById("skeletonScaleValue").value = `${Math.round(nextScale * 100)}%`;
  updateCoordinateControls();
  render();
}

function handleHistoryShortcut(event) {
  if (!event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    undoPose();
  } else if (key === "y" || (key === "z" && event.shiftKey)) {
    event.preventDefault();
    redoPose();
  }
}

function updateModeUi() {
  const rotationActive = state.rotatePose;
  document.querySelectorAll("[data-coordinate-joint]").forEach(input => { input.disabled = state.moveWhole || rotationActive; });
  document.getElementById("linkedMove").disabled = rotationActive;
  document.getElementById("symmetricMove").disabled = rotationActive;
  document.getElementById("moveWhole").disabled = rotationActive;
  document.getElementById("flipHorizontalButton").disabled = rotationActive;
  document.getElementById("swapSidesButton").disabled = rotationActive;
  document.getElementById("swapArmsButton").disabled = rotationActive;
  document.getElementById("swapLegsButton").disabled = rotationActive;
  document.getElementById("skeletonScale").disabled = rotationActive;
  document.getElementById("editReferenceImage").disabled = rotationActive;
  document.getElementById("rotationAngleControl").hidden = !rotationActive;
  document.querySelectorAll("[data-remove-limb], [data-limb-segment]").forEach(control => { control.disabled = rotationActive; });
  updateAddLimbButtons();
  canvas.classList.toggle("background-edit", state.reference.editing);
  canvas.classList.toggle("rotation-edit", rotationActive);
  const tip = document.getElementById("canvasTip");
  if (rotationActive) {
    tip.innerHTML = '<span aria-hidden="true">⟳</span> ドラッグでポーズを回転';
  } else if (state.reference.editing) {
    tip.innerHTML = '<span aria-hidden="true">↔</span> 見本画像をドラッグで移動';
  } else if (state.moveWhole) {
    tip.innerHTML = '<span aria-hidden="true">✥</span> ドラッグで全体を移動';
  } else {
    tip.innerHTML = '<span aria-hidden="true">↖</span> 関節点をドラッグで移動';
  }
  requestAnimationFrame(syncCoordinateListToCanvas);
}

function updateCoordinateControls() {
  Object.entries(state.joints).forEach(([key, joint]) => {
    const output = internalToOutput(joint);
    const xInput = document.querySelector(`[data-coordinate-joint="${key}"][data-coordinate-axis="x"]`);
    const yInput = document.querySelector(`[data-coordinate-joint="${key}"][data-coordinate-axis="y"]`);
    if (xInput) xInput.value = formatIntegerCoordinate(output.x);
    if (yInput) yInput.value = formatIntegerCoordinate(output.y);
  });
}

function handleCoordinateChange(event) {
  const key = event.target.dataset.coordinateJoint;
  const axis = event.target.dataset.coordinateAxis;
  if (!key || !axis || state.moveWhole || state.rotatePose) {
    updateCoordinateControls();
    return;
  }
  const rawValue = event.target.value.trim();
  const numericValue = Number(rawValue);
  if (!rawValue || !Number.isFinite(numericValue)) {
    updateCoordinateControls();
    showToast("有効な数値を入力してください");
    return;
  }
  const value = Math.round(numericValue);
  if (Math.abs(value) > MAX_COORDINATE) {
    updateCoordinateControls();
    showToast(`座標は-${MAX_COORDINATE}～${MAX_COORDINATE}の範囲で入力してください`);
    return;
  }
  beginHistoryTransaction();
  const current = internalToOutput(state.joints[key]);
  const nextOutput = {
    x: axis === "x" ? value : current.x,
    y: axis === "y" ? value : current.y
  };
  const deltaOutput = { x: nextOutput.x - current.x, y: nextOutput.y - current.y };
  const nextInternal = outputToInternal(nextOutput);
  state.joints[key].x = nextInternal.x;
  state.joints[key].y = nextInternal.y;
  const pairKey = getPairedJointKey(key);
  if ((state.linkedMove || state.symmetricMove) && pairKey) {
    const currentPairOutput = internalToOutput(state.joints[pairKey]);
    const pairOutput = {
      x: currentPairOutput.x + (state.symmetricMove ? -deltaOutput.x : deltaOutput.x),
      y: currentPairOutput.y + deltaOutput.y
    };
    const pairInternal = outputToInternal(pairOutput);
    state.joints[pairKey].x = pairInternal.x;
    state.joints[pairKey].y = pairInternal.y;
  }
  state.selectedJoint = key;
  updateCoordinateControls();
  render();
  updatePrompt();
  commitHistoryTransaction();
}

function setAllLabels(visible) {
  Object.keys(state.labelVisibility).forEach(label => { state.labelVisibility[label] = visible; });
  document.querySelectorAll("[data-label-joint]").forEach(input => { input.checked = visible; });
  render();
  updatePrompt();
}

function applyInstantPoseOperation(operation, message, rebuildControls = false, preserveLabelPlacements = false) {
  beginHistoryTransaction();
  operation();
  if (!preserveLabelPlacements) state.labelPlacements = {};
  state.selectedJoint = null;
  if (rebuildControls) rebuildAllDynamicControls();
  updateCoordinateControls();
  updateModeUi();
  render();
  updatePrompt();
  commitHistoryTransaction();
  showToast(message);
}

function enterRotationMode() {
  state.rotatePose = true;
  state.moveWhole = false;
  state.reference.editing = false;
  state.selectedJoint = null;
  state.labelPlacements = {};
  state.rotationSession = {
    baseJoints: cloneJoints(state.joints),
    pivot: { x: state.joints.waist.x, y: state.joints.waist.y },
    angle: 0
  };
  state.rotationDrag = null;
  document.getElementById("moveWhole").checked = false;
  document.getElementById("editReferenceImage").checked = false;
  document.getElementById("rotatePose").checked = true;
  document.getElementById("rotationAngle").value = "0";
  updateModeUi();
  render();
}

function exitRotationMode() {
  state.rotatePose = false;
  state.rotationSession = null;
  state.rotationDrag = null;
  state.dragAction = null;
  state.lastDragPoint = null;
  document.getElementById("rotatePose").checked = false;
  document.getElementById("rotationAngle").value = "0";
  canvas.classList.remove("dragging");
  updateModeUi();
  render();
}

function normalizeAngle(angle) {
  let normalized = angle % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

function applyPoseRotation(angle) {
  const session = state.rotationSession;
  if (!session) return;
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  Object.entries(session.baseJoints).forEach(([key, baseJoint]) => {
    const dx = baseJoint.x - session.pivot.x;
    const dy = baseJoint.y - session.pivot.y;
    state.joints[key].x = session.pivot.x + dx * cosine - dy * sine;
    state.joints[key].y = session.pivot.y + dx * sine + dy * cosine;
  });
  state.symmetryAxisX = session.pivot.x;
  session.angle = angle;
  document.getElementById("rotationAngle").value = formatCoordinate(angle);
  updateCoordinateControls();
  render();
  updatePrompt();
}

function applyRotationAngleInput() {
  if (!state.rotatePose || !state.rotationSession) return;
  const input = document.getElementById("rotationAngle");
  const angle = Number(input.value);
  if (!Number.isFinite(angle) || angle < -180 || angle > 180) {
    input.value = formatCoordinate(state.rotationSession.angle);
    showToast("回転角度は-180～180度で入力してください");
    return;
  }
  beginHistoryTransaction();
  applyPoseRotation(angle);
  commitHistoryTransaction();
}

function flipJointsHorizontally() {
  const axisX = state.symmetryAxisX;
  const originalCoordinates = Object.fromEntries(
    Object.entries(state.joints).map(([key, joint]) => [key, { x: joint.x, y: joint.y }])
  );
  const originalLimbs = cloneLimbs(state.limbs);
  const handled = new Set();
  [["rightArm", "leftArm"], ["rightLeg", "leftLeg"]].forEach(([rightPart, leftPart]) => {
    const rightSlot = allLimbSlots.find(slot => getSlotPart(slot) === rightPart);
    const leftSlot = allLimbSlots.find(slot => getSlotPart(slot) === leftPart);
    if (!rightSlot || !leftSlot) return;
    const rightAnchor = limbSlotDefinitions[rightSlot].anchorKey;
    const leftAnchor = limbSlotDefinitions[leftSlot].anchorKey;
    assignMirroredCoordinate(rightAnchor, originalCoordinates[leftAnchor], axisX);
    assignMirroredCoordinate(leftAnchor, originalCoordinates[rightAnchor], axisX);
    handled.add(rightAnchor);
    handled.add(leftAnchor);
    for (let index = 1; index <= 4; index += 1) {
      const oldRight = originalLimbs.find(limb => limb.slot === rightSlot && limb.index === index) || null;
      const oldLeft = originalLimbs.find(limb => limb.slot === leftSlot && limb.index === index) || null;
      if (!oldRight && !oldLeft) continue;
      const right = state.limbs.find(limb => limb.slot === rightSlot && limb.index === index) || ensureLimbRecord(rightSlot, index);
      const left = state.limbs.find(limb => limb.slot === leftSlot && limb.index === index) || ensureLimbRecord(leftSlot, index);
      copyMirroredLimbState(right, oldLeft, originalCoordinates, axisX);
      copyMirroredLimbState(left, oldRight, originalCoordinates, axisX);
      [right.middleKey, right.endKey, left.middleKey, left.endKey].forEach(key => handled.add(key));
    }
  });
  Object.keys(state.joints).filter(key => !handled.has(key)).forEach(key => assignMirroredCoordinate(key, originalCoordinates[key], axisX));
  ensureLabelVisibility();
}

function copyMirroredLimbState(target, source, originalCoordinates, axisX) {
  target.present = Boolean(source?.present);
  target.proximalVisible = source?.proximalVisible ?? true;
  target.distalVisible = source?.distalVisible ?? true;
  target.depth = source?.depth || "front";
  if (!source || !originalCoordinates[source.middleKey] || !originalCoordinates[source.endKey]) return;
  assignMirroredCoordinate(target.middleKey, originalCoordinates[source.middleKey], axisX);
  assignMirroredCoordinate(target.endKey, originalCoordinates[source.endKey], axisX);
}

function assignMirroredCoordinate(key, source, axisX) {
  if (!source || !state.joints[key]) return;
  state.joints[key].x = axisX * 2 - source.x;
  state.joints[key].y = source.y;
}

function swapLimbSemantics(types) {
  allLimbSlots.filter(slot => types.includes(limbSlotDefinitions[slot].type)).forEach(slot => {
    const nextPart = oppositeLimbPart(getSlotPart(slot));
    setSlotSemantic(slot, nextPart);
  });
  ensureLabelVisibility();
}

function setSlotSemantic(slot, part) {
  const definition = limbSlotDefinitions[slot];
  const right = part.startsWith("right");
  const prefix = right ? "R" : "L";
  const anchor = state.joints[definition.anchorKey];
  anchor.part = part;
  anchor.label = `${prefix}-${definition.type === "arm" ? "Shoulder" : "Hip"}`;
  anchor.name = right ? (definition.type === "arm" ? "右肩" : "右股関節") : (definition.type === "arm" ? "左肩" : "左股関節");
  state.limbs.filter(limb => limb.slot === slot).forEach(limb => {
    const suffix = limb.index === 1 ? "" : String(limb.index);
    const middle = state.joints[limb.middleKey];
    const end = state.joints[limb.endKey];
    middle.part = part;
    end.part = part;
    middle.label = `${prefix}-${definition.type === "arm" ? "Elbow" : "Knee"}${suffix}`;
    end.label = `${prefix}-${definition.type === "arm" ? "Wrist" : "Ankle"}${suffix}`;
    middle.name = `${right ? "右" : "左"}${definition.type === "arm" ? "肘" : "膝"}${suffix}`;
    end.name = `${right ? "右" : "左"}${definition.type === "arm" ? "手首" : "足首"}${suffix}`;
  });
}

function addLimb(part) {
  if (state.rotatePose) return;
  const slot = allLimbSlots.find(candidate => getSlotPart(candidate) === part);
  if (!slot) return;
  const presentCount = getPresentLimbs(slot).length;
  if (presentCount >= 4) {
    showToast(`${partDefinitions[part].label}は4本までです`);
    return;
  }
  beginHistoryTransaction();
  let limb = state.limbs.find(item => item.slot === slot && !item.present);
  if (!limb) {
    const used = new Set(state.limbs.filter(item => item.slot === slot).map(item => item.index));
    const index = [1, 2, 3, 4].find(value => !used.has(value));
    limb = ensureLimbRecord(slot, index);
  }
  limb.present = true;
  limb.proximalVisible = true;
  limb.distalVisible = true;
  limb.depth = "front";
  placeLimbNearExisting(limb);
  ensureLabelVisibility();
  state.labelPlacements = {};
  rebuildAllDynamicControls();
  updateCoordinateControls();
  render();
  updatePrompt();
  commitHistoryTransaction();
  showToast(`${getLimbDisplayName(limb)}を追加しました`);
}

function removeLimb(id) {
  if (state.rotatePose) return;
  const limb = state.limbs.find(item => item.id === id && item.present);
  if (!limb) return;
  const name = getLimbDisplayName(limb);
  beginHistoryTransaction();
  limb.present = false;
  state.selectedJoint = null;
  state.labelPlacements = {};
  rebuildAllDynamicControls();
  updateCoordinateControls();
  render();
  updatePrompt();
  commitHistoryTransaction();
  showToast(`${name}を削除しました`);
}

function handleLimbSegmentChange(event) {
  const id = event.target.dataset.limbId;
  const segment = event.target.dataset.limbSegment;
  const limb = state.limbs.find(item => item.id === id && item.present);
  if (!limb || !segment) return;
  beginHistoryTransaction();
  if (segment === "proximal") {
    limb.proximalVisible = event.target.checked;
    limb.distalVisible = event.target.checked;
  } else {
    limb.distalVisible = event.target.checked;
    if (limb.distalVisible) limb.proximalVisible = true;
  }
  state.selectedJoint = null;
  state.labelPlacements = {};
  rebuildLimbControls();
  render();
  updatePrompt();
  commitHistoryTransaction();
}

function ensureLimbRecord(slot, index) {
  let limb = state.limbs.find(item => item.slot === slot && item.index === index);
  if (limb) return limb;
  const definition = limbSlotDefinitions[slot];
  const middleKey = `${slot}Middle${index}`;
  const endKey = `${slot}End${index}`;
  limb = {
    id: `${slot}-${index}`, slot, type: definition.type, index, middleKey, endKey,
    present: false, proximalVisible: true, distalVisible: true, depth: "front"
  };
  state.limbs.push(limb);
  const anchor = state.joints[definition.anchorKey];
  state.joints[middleKey] = { x: anchor.x, y: anchor.y + 120, label: "", name: "", part: anchor.part };
  state.joints[endKey] = { x: anchor.x, y: anchor.y + 240, label: "", name: "", part: anchor.part };
  setSlotSemantic(slot, anchor.part);
  return limb;
}

function placeLimbNearExisting(limb) {
  const definition = limbSlotDefinitions[limb.slot];
  const anchor = state.joints[definition.anchorKey];
  const source = state.limbs.find(item => item.slot === limb.slot && item.present && item.id !== limb.id);
  let middleVector;
  let endVector;
  if (source) {
    middleVector = { x: state.joints[source.middleKey].x - anchor.x, y: state.joints[source.middleKey].y - anchor.y };
    endVector = { x: state.joints[source.endKey].x - anchor.x, y: state.joints[source.endKey].y - anchor.y };
  } else {
    middleVector = { x: initialJoints[definition.baseMiddleKey].x - initialJoints[definition.anchorKey].x, y: initialJoints[definition.baseMiddleKey].y - initialJoints[definition.anchorKey].y };
    endVector = { x: initialJoints[definition.baseEndKey].x - initialJoints[definition.anchorKey].x, y: initialJoints[definition.baseEndKey].y - initialJoints[definition.anchorKey].y };
    middleVector.x *= state.skeletonScale;
    middleVector.y *= state.skeletonScale;
    endVector.x *= state.skeletonScale;
    endVector.y *= state.skeletonScale;
  }
  const direction = limb.slot.startsWith("right") ? 1 : -1;
  const angles = [18, -18, 32, -32, 48, -48, 62, -62].map(value => value * direction);
  const candidates = angles.map(angle => {
    const middle = rotateVector(middleVector, angle);
    const end = rotateVector(endVector, angle);
    const points = {
      middle: { x: anchor.x + middle.x, y: anchor.y + middle.y },
      end: { x: anchor.x + end.x, y: anchor.y + end.y }
    };
    return { ...points, score: scoreNewLimbPlacement(anchor, points.middle, points.end, limb) };
  }).sort((a, b) => a.score - b.score);
  const selected = candidates[0];
  Object.assign(state.joints[limb.middleKey], selected.middle);
  Object.assign(state.joints[limb.endKey], selected.end);
}

function rotateVector(vector, degrees) {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { x: vector.x * cosine - vector.y * sine, y: vector.x * sine + vector.y * cosine };
}

function scoreNewLimbPlacement(anchor, middle, end, ignoredLimb) {
  let score = 0;
  getRenderableBones().forEach(bone => {
    if (bone.limbId === ignoredLimb.id) return;
    const a = state.joints[bone.a];
    const b = state.joints[bone.b];
    if (segmentsCrossAwayFromSharedEndpoint(anchor, middle, a, b)) score += 5000;
    if (segmentsCrossAwayFromSharedEndpoint(middle, end, a, b)) score += 5000;
  });
  Object.entries(state.joints).forEach(([key, joint]) => {
    if (key === ignoredLimb.middleKey || key === ignoredLimb.endKey) return;
    if (!isJointRenderable(key)) return;
    if (Math.hypot(middle.x - joint.x, middle.y - joint.y) < 24) score += 800;
    if (Math.hypot(end.x - joint.x, end.y - joint.y) < 24) score += 800;
  });
  return score;
}

function segmentsCrossAwayFromSharedEndpoint(a, b, c, d) {
  const same = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.001;
  if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
  return segmentsIntersect(a, b, c, d);
}

function resetPoseKeepingLimbComposition() {
  const composition = Object.fromEntries(["rightArm", "leftArm", "rightLeg", "leftLeg"].map(part => [part,
    state.limbs.filter(limb => limb.present && getSlotPart(limb.slot) === part)
      .sort((a, b) => a.index - b.index)
      .map(limb => ({ proximalVisible: limb.proximalVisible, distalVisible: limb.distalVisible, depth: limb.depth }))
  ]));
  const oldLabelVisibility = { ...state.labelVisibility };
  state.joints = cloneJoints(initialJoints);
  state.limbs = createInitialLimbs();
  state.labelVisibility = oldLabelVisibility;
  ["rightArm", "leftArm", "rightLeg", "leftLeg"].forEach(part => {
    const slot = allLimbSlots.find(candidate => limbSlotDefinitions[candidate].initialPart === part);
    const base = state.limbs.find(limb => limb.slot === slot && limb.index === 1);
    base.present = composition[part].length > 0;
    composition[part].forEach((saved, offset) => {
      const index = offset + 1;
      const limb = index === 1 ? base : ensureLimbRecord(slot, index);
      limb.present = true;
      limb.proximalVisible = saved.proximalVisible;
      limb.distalVisible = saved.distalVisible;
      limb.depth = saved.depth;
      if (index > 1) placeLimbNearExisting(limb);
    });
  });
  state.symmetryAxisX = DESIGN_WIDTH / 2;
  state.skeletonScale = 1;
  state.labelPlacements = {};
  state.selectedJoint = null;
  document.getElementById("skeletonScale").value = "100";
  document.getElementById("skeletonScaleValue").value = "100%";
  rebuildAllDynamicControls();
  updateCoordinateControls();
  updateModeUi();
  render();
  updatePrompt();
}

function handleReferenceImageLoad(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    event.target.value = "";
    showToast("PNG、JPEG、WebP形式の画像を選んでください");
    return;
  }
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => {
    if (state.reference.url) URL.revokeObjectURL(state.reference.url);
    state.reference.image = image;
    state.reference.url = url;
    state.reference.visible = true;
    state.reference.editing = false;
    state.reference.opacity = 0.45;
    state.reference.scale = 1;
    state.reference.x = DESIGN_WIDTH / 2;
    state.reference.y = DESIGN_HEIGHT / 2;
    document.getElementById("referenceImageOptions").hidden = false;
    document.getElementById("showReferenceImage").checked = true;
    document.getElementById("editReferenceImage").checked = false;
    document.getElementById("referenceOpacity").value = "45";
    document.getElementById("referenceScale").value = "100";
    updateReferenceControls();
    updateModeUi();
    render();
    showToast("見本画像を読み込みました");
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    event.target.value = "";
    showToast("画像を読み込めませんでした");
  };
  image.src = url;
}

function removeReferenceImage() {
  if (state.reference.url) URL.revokeObjectURL(state.reference.url);
  state.reference.image = null;
  state.reference.url = null;
  state.reference.editing = false;
  document.getElementById("referenceImageInput").value = "";
  document.getElementById("referenceImageOptions").hidden = true;
  document.getElementById("editReferenceImage").checked = false;
  updateModeUi();
  render();
  showToast("見本画像を削除しました");
}

function updateReferenceControls() {
  const output = internalToOutput({ x: state.reference.x, y: state.reference.y });
  document.getElementById("referenceX").value = formatCoordinate(output.x);
  document.getElementById("referenceY").value = formatCoordinate(output.y);
  document.getElementById("referenceOpacityValue").value = `${Math.round(state.reference.opacity * 100)}%`;
  document.getElementById("referenceScaleValue").value = `${Math.round(state.reference.scale * 100)}%`;
}

function handleReferencePositionChange() {
  const { width, height } = getOutputSize();
  const x = Number(document.getElementById("referenceX").value);
  const y = Number(document.getElementById("referenceY").value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    updateReferenceControls();
    showToast("見本画像の位置には有効な数値を入力してください");
    return;
  }
  const point = outputToInternal({ x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) });
  state.reference.x = point.x;
  state.reference.y = point.y;
  updateReferenceControls();
  render();
}

function getEditorTransform() {
  return getFrameTransform(canvas.width, canvas.height);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const pixelX = (event.clientX - rect.left) * canvas.width / rect.width;
  const pixelY = (event.clientY - rect.top) * canvas.height / rect.height;
  const transform = getEditorTransform();
  return { x: (pixelX - transform.offsetX) / transform.scale, y: (pixelY - transform.offsetY) / transform.scale };
}

function nearestJoint(point, radius = 19) {
  let nearest = null;
  let bestDistance = radius;
  Object.entries(state.joints).forEach(([key, joint]) => {
    if (!isJointRenderable(key)) return;
    const distance = Math.hypot(joint.x - point.x, joint.y - point.y);
    if (distance <= bestDistance) {
      nearest = key;
      bestDistance = distance;
    }
  });
  return nearest;
}

function handlePointerDown(event) {
  const point = canvasPoint(event);
  if (state.rotatePose && state.rotationSession) {
    const pivot = state.rotationSession.pivot;
    state.dragAction = "rotate";
    state.rotationDrag = {
      startPointerAngle: Math.atan2(point.y - pivot.y, point.x - pivot.x),
      startRotationAngle: state.rotationSession.angle
    };
    beginHistoryTransaction();
  } else if (state.reference.editing && state.reference.image) {
    state.dragAction = "reference";
  } else if (state.moveWhole) {
    state.dragAction = "whole";
    beginHistoryTransaction();
  } else {
    const key = nearestJoint(point);
    if (!key) return;
    state.dragAction = "joint";
    beginHistoryTransaction();
    state.selectedJoint = key;
  }
  state.lastDragPoint = point;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(event.pointerId);
  render();
}

function handlePointerMove(event) {
  if (!state.dragAction || !state.lastDragPoint) return;
  const point = canvasPoint(event);
  const dx = point.x - state.lastDragPoint.x;
  const dy = point.y - state.lastDragPoint.y;
  if (state.dragAction === "rotate" && state.rotationSession && state.rotationDrag) {
    const pivot = state.rotationSession.pivot;
    const pointerAngle = Math.atan2(point.y - pivot.y, point.x - pivot.x);
    const delta = normalizeAngle((pointerAngle - state.rotationDrag.startPointerAngle) * 180 / Math.PI);
    const angle = Math.max(-180, Math.min(180, state.rotationDrag.startRotationAngle + delta));
    state.lastDragPoint = point;
    applyPoseRotation(angle);
    return;
  } else if (state.dragAction === "reference") {
    state.reference.x += dx;
    state.reference.y += dy;
    updateReferenceControls();
  } else if (state.dragAction === "whole") {
    moveWholeSkeleton(dx, dy);
  } else if (state.dragAction === "joint") {
    moveSelectedJoint(point);
  }
  state.lastDragPoint = point;
  updateCoordinateControls();
  render();
  updatePrompt();
}

function moveSelectedJoint(point) {
  const key = state.selectedJoint;
  if (!key) return;
  const joint = state.joints[key];
  const dx = point.x - joint.x;
  const dy = point.y - joint.y;
  joint.x = point.x;
  joint.y = point.y;
  const pairKey = getPairedJointKey(key);
  if ((state.linkedMove || state.symmetricMove) && pairKey) {
    const pair = state.joints[pairKey];
    pair.x += state.symmetricMove ? -dx : dx;
    pair.y += dy;
  }
}

function moveWholeSkeleton(dx, dy) {
  Object.values(state.joints).forEach(joint => {
    joint.x += dx;
    joint.y += dy;
  });
  state.symmetryAxisX += dx;
}

function handlePointerUp(event) {
  if (!state.dragAction) return;
  const completedAction = state.dragAction;
  state.dragAction = null;
  state.lastDragPoint = null;
  state.rotationDrag = null;
  canvas.classList.remove("dragging");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (completedAction === "joint" || completedAction === "whole" || completedAction === "rotate") commitHistoryTransaction();
}

function handleJointDoubleClick(event) {
  if (state.moveWhole || state.reference.editing || state.rotatePose) return;
  const key = nearestJoint(canvasPoint(event));
  if (!key) return;
  event.preventDefault();
  const label = state.joints[key].label;
  const visible = !state.labelVisibility[label];
  state.labelVisibility[label] = visible;
  const checkbox = document.querySelector(`[data-label-joint="${key}"]`);
  if (checkbox) checkbox.checked = visible;
  if (!visible) delete state.labelPlacements[key];
  render();
  updatePrompt();
  showToast(`${label}の関節ラベルを${visible ? "表示" : "非表示"}にしました`);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  render();
  syncCoordinateListToCanvas();
}

function syncCoordinateListToCanvas() {
  const coordinateList = document.getElementById("coordinateControls");
  const hasExtraJoints = state.limbs.some(limb => limb.present && limb.index > 1);
  coordinateList.classList.toggle("has-extra-joints", hasExtraJoints);
  coordinateList.style.marginTop = "";
  coordinateList.style.maxHeight = "";
}

function render() {
  const rect = canvas.getBoundingClientRect();
  const transform = getEditorTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(transform.scale, 0, 0, transform.scale, transform.offsetX, transform.offsetY);
  drawReferenceImage(ctx);
  renderScene(ctx, { labels: true, labelColor: "#243035", selected: state.selectedJoint, editor: true });
  ctx.restore();
  if (!rect.width) requestAnimationFrame(resizeCanvas);
}

function drawReferenceImage(target) {
  const reference = state.reference;
  if (!reference.image || !reference.visible) return;
  const baseScale = Math.min(DESIGN_WIDTH / reference.image.naturalWidth, DESIGN_HEIGHT / reference.image.naturalHeight);
  const width = reference.image.naturalWidth * baseScale * reference.scale;
  const height = reference.image.naturalHeight * baseScale * reference.scale;
  const x = reference.x - width / 2;
  const y = reference.y - height / 2;
  target.save();
  target.globalAlpha = reference.opacity;
  target.drawImage(reference.image, x, y, width, height);
  target.restore();
  if (reference.editing) {
    target.save();
    target.strokeStyle = "rgba(240, 100, 73, 0.9)";
    target.lineWidth = 2;
    target.setLineDash([8, 6]);
    target.strokeRect(x, y, width, height);
    target.restore();
  }
}

function renderScene(target, options) {
  getPresentLimbs().filter(limb => limb.depth === "back").forEach(limb => drawLimb(target, limb, true));
  drawTorso(target);
  drawHead(target);
  getPresentLimbs().filter(limb => limb.depth !== "back").forEach(limb => drawLimb(target, limb, false));
  drawJoints(target, options.selected, options.editor);
  if (options.labels) drawLabels(target, options.labelColor);
}

function getPoseColor(part, alpha = 1) {
  const color = state.poseBlack ? "#000000" : state.colors[part];
  return alpha < 1 ? hexToRgba(color, alpha) : color;
}

function drawTorso(target) {
  target.save();
  target.strokeStyle = getPoseColor("torso");
  target.lineWidth = 14;
  target.lineCap = "round";
  target.lineJoin = "round";
  torsoBones.forEach(bone => {
    target.beginPath();
    target.moveTo(state.joints[bone.a].x, state.joints[bone.a].y);
    target.lineTo(state.joints[bone.b].x, state.joints[bone.b].y);
    target.stroke();
  });
  target.restore();
}

function drawLimb(target, limb, isBack) {
  const part = getSlotPart(limb.slot);
  const anchorKey = limbSlotDefinitions[limb.slot].anchorKey;
  target.save();
  target.strokeStyle = getPoseColor(part, isBack ? 0.42 : 1);
  target.lineWidth = 16;
  target.lineCap = "round";
  target.lineJoin = "round";
  target.setLineDash(isBack ? [16, 13] : []);
  if (limb.proximalVisible) drawBoneSegment(target, anchorKey, limb.middleKey);
  if (limb.proximalVisible && limb.distalVisible) drawBoneSegment(target, limb.middleKey, limb.endKey);
  target.restore();
}

function drawBoneSegment(target, a, b) {
  target.beginPath();
  target.moveTo(state.joints[a].x, state.joints[a].y);
  target.lineTo(state.joints[b].x, state.joints[b].y);
  target.stroke();
}

function getRenderableBones() {
  const result = torsoBones.map(bone => ({ ...bone }));
  getPresentLimbs().forEach(limb => {
    const anchorKey = limbSlotDefinitions[limb.slot].anchorKey;
    if (limb.proximalVisible) result.push({ a: anchorKey, b: limb.middleKey, part: getSlotPart(limb.slot), limbId: limb.id });
    if (limb.proximalVisible && limb.distalVisible) result.push({ a: limb.middleKey, b: limb.endKey, part: getSlotPart(limb.slot), limbId: limb.id });
  });
  return result;
}

function isJointRenderable(key) {
  const slot = allLimbSlots.find(candidate => limbSlotDefinitions[candidate].anchorKey === key);
  if (slot) return getPresentLimbs(slot).length > 0;
  const limb = getLimbByJointKey(key);
  if (!limb || !limb.present) return !limb;
  if (key === limb.middleKey) return limb.proximalVisible;
  if (key === limb.endKey) return limb.proximalVisible && limb.distalVisible;
  return true;
}

function drawHead(target) {
  const head = state.joints.head;
  const headRadius = getHeadRadius();
  target.save();
  target.fillStyle = state.poseBlack ? "#000000" : hexToRgba(state.colors.head, 0.23);
  target.strokeStyle = getPoseColor("head");
  target.lineWidth = 11;
  target.beginPath();
  target.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
  target.fill();
  target.stroke();
  target.beginPath();
  const neck = state.joints.neck;
  const dx = neck.x - head.x;
  const dy = neck.y - head.y;
  const distance = Math.hypot(dx, dy);
  if (distance > headRadius) {
    target.moveTo(head.x + dx / distance * headRadius, head.y + dy / distance * headRadius);
    target.lineTo(neck.x, neck.y);
    target.stroke();
  }
  target.restore();
}

function getHeadRadius() {
  return HEAD_RADIUS * state.skeletonScale;
}

function drawJoints(target, selected, editor) {
  Object.entries(state.joints).forEach(([key, joint]) => {
    if (!isJointRenderable(key)) return;
    target.save();
    const limb = getLimbByJointKey(key);
    const isBack = limb?.depth === "back";
    target.globalAlpha = isBack ? 0.58 : 1;
    if (editor && key === selected) {
      target.fillStyle = hexToRgba("#f06449", 0.18);
      target.beginPath();
      target.arc(joint.x, joint.y, 17, 0, Math.PI * 2);
      target.fill();
    }
    target.fillStyle = state.poseBlack && !editor ? "#000000" : "#fffefa";
    target.strokeStyle = getPoseColor(joint.part);
    target.lineWidth = 5;
    target.beginPath();
    target.arc(joint.x, joint.y, key === "head" ? 8 : 9, 0, Math.PI * 2);
    target.fill();
    target.stroke();
    target.restore();
  });
}

function drawLabels(target, color) {
  target.save();
  target.font = '700 13px "Yu Gothic UI", Meiryo, sans-serif';
  target.textBaseline = "middle";
  target.textAlign = "center";
  const labelBackground = color === "#f5f5f2" ? "rgba(16, 20, 22, 0.86)" : "rgba(255, 254, 250, 0.88)";
  const layout = computeLabelLayout(target);
  Object.entries(layout).forEach(([key, box]) => {
    const joint = state.joints[key];
    target.fillStyle = labelBackground;
    roundRect(target, box.x, box.y, box.width, box.height, 5);
    target.fill();
    target.fillStyle = color;
    target.fillText(joint.label, box.x + box.width / 2, box.y + box.height / 2 + 0.5);
  });
  target.restore();
}

function computeLabelLayout(target) {
  const layout = {};
  const placedBoxes = [];
  Object.entries(state.joints).forEach(([key, joint]) => {
    if (!isJointRenderable(key)) return;
    if (!state.labelVisibility[joint.label]) return;
    const metrics = target.measureText(joint.label);
    const width = metrics.width + 12;
    const measuredHeight = (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0);
    const height = Math.max(LABEL_HEIGHT, measuredHeight + 7);
    const candidates = createLabelCandidates(key, joint, width, height);
    if (!candidates.length) {
      delete state.labelPlacements[key];
      return;
    }
    const scored = candidates.map(candidate => ({
      ...candidate,
      score: scoreLabelCandidate(candidate, key, placedBoxes)
    }));
    scored.sort((a, b) => a.score - b.score);
    let selected = scored[0];
    const currentId = state.labelPlacements[key];
    const current = scored.find(candidate => candidate.id === currentId);
    if (current && current.score <= selected.score + 350) selected = current;
    state.labelPlacements[key] = selected.id;
    layout[key] = selected;
    placedBoxes.push(selected);
  });
  return layout;
}

function createLabelCandidates(key, joint, width, height) {
  const prefersLeft = key.startsWith("r");
  const directions = prefersLeft
    ? ["upLeft", "left", "downLeft", "up", "down", "upRight", "right", "downRight"]
    : ["upRight", "right", "downRight", "up", "down", "upLeft", "left", "downLeft"];
  const result = [];
  const headOutlineRadius = getHeadRadius() + 5.5;
  const distances = key === "head"
    ? [headOutlineRadius + 7, headOutlineRadius + 22, headOutlineRadius + 37]
    : LABEL_DISTANCES;
  distances.forEach(distance => {
    directions.forEach((direction, directionIndex) => {
      let x = joint.x - width / 2;
      let y = joint.y - height / 2;
      if (direction.includes("Left")) x = joint.x - distance - width;
      if (direction.includes("Right")) x = joint.x + distance;
      if (direction === "left") x = joint.x - distance - width;
      if (direction === "right") x = joint.x + distance;
      if (direction.includes("up") || direction === "up") y = joint.y - distance - height;
      if (direction.includes("down") || direction === "down") y = joint.y + distance;
      result.push({ id: `${distance}-${direction}`, x, y, width, height, distance, directionIndex });
    });
  });
  const bounds = getVisibleFrameBounds();
  const markerRadius = key === "head" ? 10.5 : 11.5;
  if (key === "head") {
    if (!circleIntersectsBounds(joint, headOutlineRadius, bounds)) return [];
    return result.filter(candidate => rectangleIsInsideBounds(candidate, bounds)
      && !rectangleIntersectsCircle(candidate, joint, headOutlineRadius));
  }
  if (circleIntersectsBounds(joint, markerRadius, bounds)) {
    return result.map(candidate => constrainRectangleToBounds(candidate, bounds));
  }
  const outsideCandidates = result.filter(candidate => rectangleIsOutsideBounds(candidate, bounds));
  return outsideCandidates.length ? outsideCandidates : result;
}

function constrainRectangleToBounds(rectangle, bounds) {
  return {
    ...rectangle,
    x: Math.max(bounds.left, Math.min(rectangle.x, bounds.right - rectangle.width)),
    y: Math.max(bounds.top, Math.min(rectangle.y, bounds.bottom - rectangle.height))
  };
}

function circleIntersectsBounds(circle, radius, bounds) {
  return circle.x + radius >= bounds.left
    && circle.x - radius <= bounds.right
    && circle.y + radius >= bounds.top
    && circle.y - radius <= bounds.bottom;
}

function rectangleIsOutsideBounds(rectangle, bounds) {
  return rectangle.x + rectangle.width <= bounds.left
    || rectangle.x >= bounds.right
    || rectangle.y + rectangle.height <= bounds.top
    || rectangle.y >= bounds.bottom;
}

function rectangleIsInsideBounds(rectangle, bounds) {
  return rectangle.x >= bounds.left
    && rectangle.y >= bounds.top
    && rectangle.x + rectangle.width <= bounds.right
    && rectangle.y + rectangle.height <= bounds.bottom;
}

function scoreLabelCandidate(candidate, jointKey, placedBoxes) {
  let score = candidate.distance * 3 + candidate.directionIndex;
  const bounds = getVisibleFrameBounds();
  const insideWidth = Math.max(0, Math.min(candidate.x + candidate.width, bounds.right) - Math.max(candidate.x, bounds.left));
  const insideHeight = Math.max(0, Math.min(candidate.y + candidate.height, bounds.bottom) - Math.max(candidate.y, bounds.top));
  const outsideArea = candidate.width * candidate.height - insideWidth * insideHeight;
  score += outsideArea * 80;
  placedBoxes.forEach(box => {
    const overlap = rectangleOverlapArea(candidate, box);
    if (overlap > 0) score += 5000 + overlap * 30;
  });
  Object.entries(state.joints).forEach(([key, joint]) => {
    if (!isJointRenderable(key)) return;
    const radius = key === "head" ? getHeadRadius() + 6 : 14;
    if (rectangleIntersectsCircle(candidate, joint, radius)) score += key === "head" ? 1000000 : (key === jointKey ? 1600 : 2200);
  });
  getRenderableBones().forEach(bone => {
    if (segmentIntersectsRectangle(state.joints[bone.a], state.joints[bone.b], candidate, 7)) score += 1100;
  });
  return score;
}

function rectangleOverlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function rectangleIntersectsCircle(rect, circle, radius) {
  const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < radius;
}

function segmentIntersectsRectangle(a, b, rect, padding = 0) {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  if (pointInRectangle(a, left, right, top, bottom) || pointInRectangle(b, left, right, top, bottom)) return true;
  return segmentsIntersect(a, b, { x: left, y: top }, { x: right, y: top })
    || segmentsIntersect(a, b, { x: right, y: top }, { x: right, y: bottom })
    || segmentsIntersect(a, b, { x: right, y: bottom }, { x: left, y: bottom })
    || segmentsIntersect(a, b, { x: left, y: bottom }, { x: left, y: top });
}

function pointInRectangle(point, left, right, top, bottom) {
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return ((abC === 0 && pointOnSegment(c, a, b)) || (abD === 0 && pointOnSegment(d, a, b))
    || (cdA === 0 && pointOnSegment(a, c, d)) || (cdB === 0 && pointOnSegment(b, c, d))
    || ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)));
}

function pointOnSegment(point, a, b) {
  return point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x)
    && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
}

function roundRect(target, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  target.beginPath();
  target.moveTo(x + r, y);
  target.arcTo(x + width, y, x + width, y + height, r);
  target.arcTo(x + width, y + height, x, y + height, r);
  target.arcTo(x, y + height, x, y, r);
  target.arcTo(x, y, x + width, y, r);
  target.closePath();
}

function updatePoseBlackUi() {
  const backgroundSelect = document.getElementById("exportBackground");
  const blackOption = backgroundSelect.querySelector('option[value="black"]');
  if (blackOption) blackOption.disabled = state.poseBlack;
  if (state.poseBlack && backgroundSelect.value === "black") {
    backgroundSelect.value = "white";
    showToast("ポーズ黒化のため背景色を白に変更しました");
  }
}

function exportPng() {
  const { width, height } = getOutputSize();
  const background = document.getElementById("exportBackground").value;
  const labels = document.getElementById("exportLabels").checked;
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputContext = output.getContext("2d");
  if (background !== "transparent") {
    outputContext.fillStyle = background === "black" ? "#101416" : "#ffffff";
    outputContext.fillRect(0, 0, width, height);
  }
  const transform = getFrameTransform(width, height);
  outputContext.save();
  outputContext.setTransform(transform.scale, 0, 0, transform.scale, transform.offsetX, transform.offsetY);
  renderScene(outputContext, { labels, labelColor: contrastColor(background), selected: null, editor: false });
  outputContext.restore();
  output.toBlob(blob => {
    if (!blob) {
      showToast("PNGの作成に失敗しました");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pose-reference-${width}x${height}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`${width} × ${height} のPNGを保存しました`);
  }, "image/png");
}

function generatePrompt() {
  const visibleLimbs = getPresentLimbs();
  const hasBackPart = visibleLimbs.some(limb => limb.depth === "back");
  const depthLines = visibleLimbs
    .sort((a, b) => allLimbSlots.indexOf(a.slot) - allLimbSlots.indexOf(b.slot) || a.index - b.index)
    .map(limb => `- ${getLimbDisplayName(limb)}：${limb.depth === "back" ? "奥（破線・薄い表示）" : "手前（実線表示）"}`)
    .join("\n");
  const hasExportedLabel = document.getElementById("exportLabels").checked
    && Object.entries(state.joints).some(([key, joint]) => isJointRenderable(key) && state.labelVisibility[joint.label]);
  const importantRule = hasExportedLabel
    ? "重要：棒人間、文字ラベルは最終画像に描かず、棒人間の色も最終画像に反映しないでください。これらはポーズを説明するための補助記号です。"
    : "重要：棒人間は最終画像に描かず、棒人間の色も最終画像に反映しないでください。これはポーズを説明するための補助記号です。";
  const sideColorParts = [];
  if (semanticLimbExists("rightArm")) sideColorParts.push("青い腕がキャラクターの右腕");
  if (semanticLimbExists("rightLeg")) sideColorParts.push("緑の脚がキャラクターの右脚");
  if (semanticLimbExists("leftArm")) sideColorParts.push("赤い腕がキャラクターの左腕");
  if (semanticLimbExists("leftLeg")) sideColorParts.push("紫の脚がキャラクターの左脚");
  const colorSideRule = `左右は必ず「キャラクター自身から見た左右」です。${sideColorParts.length ? `${sideColorParts.join("、")}です。` : ""}`;
  const labelSideRule = state.poseBlack ? "左右は必ず「キャラクター自身から見た左右」です。画像内のR/L文字ラベルに従ってください。" : colorSideRule;
  const labelRule = "画像内の文字ラベルは、キャラクター自身の身体部位を示しています。Rはキャラクター自身の右側（Right）、Lはキャラクター自身の左側（Left）を意味します。画像を見る側からの左右ではありません。例えば、R-Wristはキャラクター自身の右手首を意味します。";
  const sections = [
    "添付画像は、キャラクターのポーズを指定するための2D参照画像です。画像内の関節位置、手足の向き、身体の傾き、部位同士の位置関係を可能な限り忠実に再現してください。",
    "この参照画像はポーズの指定にのみ使用し、画風、キャラクターの体型、外見、衣装などは別途指定された内容に従ってください。",
    importantRule
  ];
  if (!state.poseBlack) {
    const colorLines = Object.entries(partDefinitions)
      .filter(([key]) => !["rightArm", "leftArm", "rightLeg", "leftLeg"].includes(key) || semanticLimbExists(key))
      .map(([key, definition]) => `- ${definition.label}：${state.colors[key]}（${colorName(key)}）`)
      .join("\n");
    sections.push(`【色の意味】\n${colorLines}`);
    sections.push(`${colorSideRule}${hasExportedLabel ? `\n${labelRule}` : ""}`);
  } else if (hasExportedLabel) {
    sections.push(`${labelSideRule}\n${labelRule}`);
  }
  if (hasBackPart) {
    sections.push(`【前後関係】\n${depthLines}\n前後関係は、身体部位が重なった場合の奥行きを示す情報です。奥と指定された部位は、重なりのある箇所で手前側の部位に隠れるように解釈してください。`);
  }
  const correctionRule = hasBackPart
    ? "人体として不自然な箇所は、指定した位置関係を保ちながら自然に補正してください。"
    : "人体として不自然な箇所は、関節位置とポーズの意図を保ちながら自然に補正してください。";
  sections.push(correctionRule);
  promptOutput.value = sections.join("\n\n");
}

function colorName(key) {
  const defaults = { head: "黄色", torso: "灰色", rightArm: "青色", leftArm: "赤色", rightLeg: "緑色", leftLeg: "紫色" };
  return defaults[key];
}

function updatePrompt() {
  generatePrompt();
}

async function copyPrompt() {
  const copied = await copyText(promptOutput.value, promptOutput);
  showToast(copied ? "プロンプトをコピーしました" : "コピーできませんでした。手動で選択してください");
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2300);
}

loadSavedPosesFromBrowser();
initializeControls();
bindEvents();
generatePrompt();
requestAnimationFrame(resizeCanvas);
