import { AnnotationType, ContentTypeMisoConfig, NodeMisoConfig, PropertyConfig } from "./types";

export interface IGuidelines {
  /** Refinements of the Collection node, e.g. Letter or Abstract */
  collections: {
    miso?: NodeMisoConfig;
    properties: {
      system: PropertyConfig[];
      base: PropertyConfig[];
    };
    types: {
      additionalLabel: string;
      properties: PropertyConfig[];
      annotations: {
        types: AnnotationType[];
        properties: PropertyConfig[];
      };
      miso?: NodeMisoConfig;
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
    miso?: NodeMisoConfig;
    types: {
      additionalLabel: string;
      miso?: ContentTypeMisoConfig;
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
    miso?: NodeMisoConfig;
    types: {
      additionalLabel: string;
      miso?: NodeMisoConfig;
    }[];
  };
}
