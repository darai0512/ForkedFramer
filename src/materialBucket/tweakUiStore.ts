import { createPreferenceStore, assurePreferences } from '../preferences';

assurePreferences();

// MaterialBucket
export const MaterialBucket_closeOnDragStore = createPreferenceStore<boolean>('tweakUi', 'MaterialBucket_closeOnDrag', true);

// TextLiftDialog
export const TextLiftDialog_applyEraserStore = createPreferenceStore<boolean>('tweakUi', 'TextLiftDialog_applyEraser', false);
