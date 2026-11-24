/** The CSS variable on a form's root that holds the height of its sticky heading, set by `FormHeader` */
export const FORM_HEADER_HEIGHT_VAR = "--form-header-height";

/**
 * Where a section heading sticks: right below the form heading. The form column's padding (1.5rem) is subtracted, the
 * form heading reaches over it.
 */
export const SECTION_HEADING_TOP = `calc(var(${FORM_HEADER_HEIGHT_VAR}, 1.5rem) - 1.5rem)`;
