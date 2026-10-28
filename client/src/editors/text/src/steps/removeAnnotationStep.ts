import { Node, Schema } from "@tiptap/pm/model";
import { Step, StepResult, Mapping } from "@tiptap/pm/transform";
import { Annotation } from "../external";
import { AddAnnotationStep } from "./addAnnotationStep";

/**
 * A custom ProseMirror step that signals the `annotationDecoration` plugin to remove a decoration.
 *
 * It does not modify the document — it exists solely as a data carrier. The reason for this
 * indirection is that ProseMirror's history plugin only records `tr.steps`, not plugin state.
 * By placing the annotation data into an actual step, the history plugin records it and calls
 * `invert()` on undo, producing an {@link AddAnnotationStep} that the plugin then acts on.
 *
 * The step carries the whole annotation (data, status and connected nodes) as it was stored in the removed
 * decoration, so that undo restores it completely.
 *
 * The positions are deliberately not named `from`/`to`: tiptap's `getChangedRanges` treats every step
 * without a step map but with `from`/`to` fields as a changed document range, which breaks extensions
 * relying on it (e.g. UniqueID) on undo/redo.
 */
export class RemoveAnnotationStep extends Step {
  constructor(
    readonly annotation: Annotation,
    readonly annotationFrom: number,
    readonly annotationTo: number,
  ) {
    super();
  }

  apply(doc: Node): StepResult {
    //Returns the original document since it is not touched at all.
    return StepResult.ok(doc);
  }

  invert(): AddAnnotationStep {
    // Returns the opposite step
    return new AddAnnotationStep(this.annotation, this.annotationFrom, this.annotationTo);
  }

  map(mapping: Mapping): RemoveAnnotationStep {
    const from: number = mapping.map(this.annotationFrom);
    const to: number = mapping.map(this.annotationTo);

    return new RemoveAnnotationStep(this.annotation, from, to);
  }

  toJSON() {
    // Kept for consistency, not really needed (JSON serialization is only relevant during collaboration when
    // steps need to be sent over the network). Here, everything is kept in memory anyway.
    return {
      stepType: "removeAnnotation",
      annotation: this.annotation,
      from: this.annotationFrom,
      to: this.annotationTo,
    };
  }

  static fromJSON(_schema: Schema, json: { annotation: Annotation; from: number; to: number }): RemoveAnnotationStep {
    // Kept for consistency, not really needed (JSON serialization is only relevant during collaboration when
    // steps need to be sent over the network). Here, everything is kept in memory anyway.
    return new RemoveAnnotationStep(json.annotation, json.from, json.to);
  }
}
