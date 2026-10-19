import { AnnotationType, PropertyConfig } from "./types.js";

export interface IGuidelines {
  /** Refinements of the Collection node, e.g. Letter or Abstract */
  collections: {
    miso?: unknown;
    properties: {
      system: PropertyConfig[];
      base: PropertyConfig[];
    };
    types: {
      additionalLabel: string;
      miso?: unknown;
      properties: PropertyConfig[];
      annotations: {
        types: AnnotationType[];
        properties: PropertyConfig[];
      };
    }[];
    annotations: {
      types: AnnotationType[];
      properties: {
        system: PropertyConfig[];
        base: PropertyConfig[];
      };
    };
  };
  /** Refinements of the Content node, e.g. Text or Image */
  contents: {
    miso?: unknown;
    types: {
      additionalLabel: string;
      miso?: unknown;
    }[];
    annotations: {
      types: AnnotationType[];
      properties: {
        system: PropertyConfig[];
        base: PropertyConfig[];
      };
    };
  };
  /** Refinements of the Entity node, e.g. Person or Place */
  entities: {
    miso?: unknown;
    types: {
      additionalLabel: string;
      miso?: unknown;
    }[];
  };
}
