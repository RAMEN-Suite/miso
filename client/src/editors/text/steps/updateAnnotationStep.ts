import { Node, Schema } from "@tiptap/pm/model";
import { Step, StepResult } from "@tiptap/pm/transform";
import { Annotation } from "../../../models/types";

/**
 * A custom ProseMirror step that signals the `annotationDecoration` plugin to replace the annotation
 * stored in a decoration, e.g. after the user edited its data.
 *
 * It does not modify the document — it exists only as a data carrier. The reason for this
 * indirection is that ProseMirror's history plugin only records `tr.steps`, not plugin state.
 * By placing both the old and the new annotation into an actual step, the history plugin records it and
 * calls `invert()` on undo, producing a step that restores the old annotation including its old status.
 *
 * Unlike {@link AddAnnotationStep} and {@link RemoveAnnotationStep}, the step carries no positions: the
 * decoration is looked up by the annotation's uuid and keeps its current range. Replaying a stored range
 * on undo would otherwise revert range changes that happened in the meantime (e.g. by typing at the end
 * of the annotated text).
 */
export class UpdateAnnotationStep extends Step {
  constructor(
    readonly oldAnnotation: Annotation,
    readonly newAnnotation: Annotation,
  ) {
    super();
  }

  apply(doc: Node): StepResult {
    //Returns the original document since it is not touched at all.
    return StepResult.ok(doc);
  }

  invert(): UpdateAnnotationStep {
    // Returns the opposite step
    return new UpdateAnnotationStep(this.newAnnotation, this.oldAnnotation);
  }

  map(): this {
    // No positions to map
    return this;
  }

  toJSON() {
    // Kept for consistency, not really needed (JSON serialization is only relevant during collaboration when
    // steps need to be sent over the network). Here, everything is kept in memory anyway.
    return {
      stepType: "updateAnnotation",
      oldAnnotation: this.oldAnnotation,
      newAnnotation: this.newAnnotation,
    };
  }

  static fromJSON(_schema: Schema, json: { oldAnnotation: Annotation; newAnnotation: Annotation }): UpdateAnnotationStep {
    // Kept for consistency, not really needed (JSON serialization is only relevant during collaboration when
    // steps need to be sent over the network). Here, everything is kept in memory anyway.
    return new UpdateAnnotationStep(json.oldAnnotation, json.newAnnotation);
  }
}
