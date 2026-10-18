import { AnnotationConfigEntity, AnnotationType, ContentTypeMisoConfig, NodeMisoConfig, PropertyConfig } from "./types";

export interface IGuidelines {
  collections: {
    /** Miso-only configuration of the base Collection node */
    miso?: NodeMisoConfig;
    properties: {
      system: PropertyConfig[];
      base: PropertyConfig[];
    };
    types: {
      additionalLabel: string;
      properties: PropertyConfig[];
      annotations: {
        additionalTexts: string[];
        types: AnnotationType[];
        properties: PropertyConfig[];
        entities: AnnotationConfigEntity[];
      };
      /** Miso-only configuration */
      miso?: NodeMisoConfig;
    }[];
    annotations: {
      additionalTexts: string[];
      types: AnnotationType[];
      properties: {
        system: PropertyConfig[];
        base: PropertyConfig[];
      };
      entities: AnnotationConfigEntity[];
    };
  };
  contents: {
    /** Miso-only configuration of the base Content node */
    miso?: NodeMisoConfig;
    types: {
      additionalLabel: string;
      /** Miso-only configuration */
      miso?: ContentTypeMisoConfig;
    }[];
    /** Annotations of Content nodes, e.g. the annotation types of the text editor */
    annotations: {
      additionalTexts: string[];
      types: AnnotationType[];
      properties: {
        system: PropertyConfig[];
        base: PropertyConfig[];
      };
      entities: AnnotationConfigEntity[];
    };
  };
}
