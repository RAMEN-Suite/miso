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
    properties: [],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      editing: { role: "structure", anchor: "range", contains: [], priority: 20 },
    },
  },
  {
    type: "heading",
    properties: [
      {
        name: "level",
        type: "Integer",
        minimum: 1,
        maximum: 6,
        required: true,
        editable: true,
        visible: true,
      },
    ],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      editing: { role: "structure", anchor: "range", contains: [], priority: 30 },
    },
  },
  {
    type: "hardBreak",
    properties: [],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      editing: { role: "structure", anchor: "zeroPoint", contains: [], priority: 10 },
    },
  },
  {
    type: "table",
    properties: [],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      // caption/heading can be added later by extending contains via guidelines JSON
      editing: { role: "structure", anchor: "range", contains: ["tableRow"], priority: 90 },
    },
  },
  {
    type: "tableRow",
    properties: [],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      editing: { role: "structure", anchor: "range", contains: ["tableCell"], priority: 80 },
    },
  },
  {
    type: "tableCell",
    properties: [
      { name: "rowspan", type: "Integer", required: true, editable: true, visible: true },
      { name: "colspan", type: "Integer", required: true, editable: true, visible: true },
    ],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      editing: { role: "structure", anchor: "range", contains: ["paragraph", "heading", "bulletList", "table"], priority: 70 },
    },
  },
  {
    type: "bulletList",
    properties: [],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      // caption/heading can be added later by extending contains via guidelines JSON
      editing: { role: "structure", anchor: "range", contains: ["listItem"], priority: 60 },
    },
  },
  {
    type: "listItem",
    properties: [],
    miso: {
      group: "structure",
      controls: { defaultSelected: true },
      editing: { role: "structure", anchor: "range", contains: ["paragraph", "heading", "bulletList", "table"], priority: 50 },
    },
  },
];
