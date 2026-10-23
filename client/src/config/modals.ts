import { DialogProps } from "primevue";

/**
 * Default props for every modal. Can be overriden.
 */
export const BASE_MODAL_PROPS = {
  modal: true,
  closable: true,
  closeOnEscape: true,
  dismissableMask: false,
  closeIcon: "icon-x",
  pt: {
    pcCloseButton: { root: { title: "Close" } },
  },
} as const satisfies DialogProps;

/**
 * Props for modals with a scrolling body and a fixed footer. The dialog content does not scroll itself, but passes
 * its height on to the modal component, which decides which part scrolls.
 */
export const FIXED_FOOTER_MODAL_PROPS = {
  ...BASE_MODAL_PROPS,
  contentStyle: { display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0, overflow: "hidden" },
} as const satisfies DialogProps;

/**
 * Props for annotation create/edit modals.
 */
export const ANNOTATION_MODAL_PROPS = {
  ...FIXED_FOOTER_MODAL_PROPS,
  style: { width: "25rem", height: "35rem" },
} as const satisfies DialogProps;
