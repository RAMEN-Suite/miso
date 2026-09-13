import { DialogProps } from "primevue";

/**
 * Default props for every modal. Can be overriden.
 */
export const BASE_MODAL_PROPS = {
  modal: true,
  closable: true,
  closeOnEscape: true,
  dismissableMask: false,
  pt: {
    pcCloseButton: { root: { title: "Close" } },
  },
} as const satisfies DialogProps;

/**
 * Props for annotation create/edit modals.
 */
export const ANNOTATION_MODAL_PROPS = {
  ...BASE_MODAL_PROPS,
  style: { width: "25rem", height: "35rem" },
} as const satisfies DialogProps;
