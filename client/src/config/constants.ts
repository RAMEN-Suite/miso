import { AnnotationType } from "../models/types";

/**
 * Delay in miliseconds before fetching new data based on changed parameters
 */
export const FETCH_DELAY: number = 300;

/**
 * Prefix for lucide icon names. Is combined with the icon name
 * to form the full Lucide icon name (e.g. `icon-folder`).
 */
export const LUCIDE_ICON_PREFIX = "icon-" as const;

/**
 * Configurations of built-in structural annotation types. Is combined with the project-specifig configuration
 * on load, so these types can be overridden.
 */
export const BUILTIN_STRUCTURAL_CONFIGS: AnnotationType[] = [
  {
    type: "paragraph",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    contains: [],
    topLevel: true,
    priority: 20,
    properties: [],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "heading",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    contains: [],
    topLevel: true,
    priority: 30,
    properties: [
      {
        name: "level",
        type: "number",
        minimum: 1,
        maximum: 6,
        required: true,
        editable: true,
        visible: true,
      },
    ],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "hardBreak",
    role: "structure",
    behaviour: "zeroPoint",
    isBlock: true,
    contains: [],
    topLevel: false,
    priority: 10,
    properties: [],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "table",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    // caption/heading can be added later by extending contains via guidelines JSON
    contains: ["tableRow"],
    topLevel: true,
    priority: 90,
    properties: [],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "tableRow",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    contains: ["tableHeader", "tableCell"],
    topLevel: false,
    priority: 80,
    properties: [],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "tableCell",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    contains: ["paragraph", "heading", "bulletList", "table"],
    topLevel: false,
    priority: 70,
    properties: [
      { name: "rowspan", type: "number", required: true, editable: true, visible: true },
      { name: "colspan", type: "number", required: true, editable: true, visible: true },
    ],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "tableHeader",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    contains: ["paragraph", "heading", "bulletList", "table"],
    topLevel: false,
    priority: 70,
    properties: [
      { name: "rowspan", type: "number", required: true, editable: true, visible: true },
      { name: "colspan", type: "number", required: true, editable: true, visible: true },
    ],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "bulletList",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    // caption/heading can be added later by extending contains via guidelines JSON
    contains: ["listItem"],
    topLevel: true,
    priority: 60,
    properties: [],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
  {
    type: "listItem",
    role: "structure",
    behaviour: "range",
    isBlock: true,
    contains: ["paragraph", "heading", "bulletList", "table"],
    topLevel: false,
    priority: 50,
    properties: [],
    shortcut: [],
    text: "",
    category: "structure",
    defaultSelected: true,
  },
];
