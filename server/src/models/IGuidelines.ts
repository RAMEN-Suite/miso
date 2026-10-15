import { AnnotationConfigEntity, AnnotationType, PropertyConfig } from "./types.js";

export interface IGuidelines {
  collections: {
    /** Miso-only frontend configuration. Not read by the server, passed through as is. */
    miso?: unknown;
    properties: {
      system: PropertyConfig[];
      base: PropertyConfig[];
    };
    types: {
      additionalLabel: string;
      /** Miso-only frontend configuration. Not read by the server, passed through as is. */
      miso?: unknown;
      properties: PropertyConfig[];
      annotations: {
        additionalTexts: string[];
        types: AnnotationType[];
        properties: PropertyConfig[];
        entities: AnnotationConfigEntity[];
      };
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
  annotations: {
    additionalTexts: string[];
    types: AnnotationType[];
    properties: {
      system: PropertyConfig[];
      base: PropertyConfig[];
    };
    entities: AnnotationConfigEntity[];
  };
  texts: {
    additionalLabels: string[];
  };
}
