import { AnnotationConfigEntity, AnnotationType, NodeMisoConfig, PropertyConfig } from "./types";

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
      miso?: NodeMisoConfig & {
        /** Quick fix to determine which collections should be loaded into the overview table */
        level?: "primary" | "secondary";
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
