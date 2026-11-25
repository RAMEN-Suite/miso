import { ref, readonly, Ref, DeepReadonly } from "vue";
import { CollectionNode, ContentNode, EntityNode } from "../models/types";

/** A node picked as reference: a stored one from the search, or a new one (`isNew`) from a draft */
export interface PickedNode {
  node: CollectionNode | ContentNode | EntityNode;
  isNew: boolean;
}

interface ErrorMessage {
  severity: string;
  content: string;
  id: number;
}

type PipelineStep = null | "choosing" | "finishing";

export interface UseAddNodeReturn {
  currentStep: Readonly<Ref<PipelineStep, PipelineStep>>;
  errorMessages: DeepReadonly<Ref<ErrorMessage[], ErrorMessage[]>>;
  node: Ref<PickedNode | null>;
  addErrorMessage: (error: unknown) => void;
  cancel: () => void;
  finish: () => void;
  setNode: (node: PickedNode | null) => void;
  setPipelineStep: (step: PipelineStep) => void;
}

/**
 * A composable function that provides the pipeline for adding a node as a reference.
 *
 * The pipeline starts in the "choosing" step, where an existing node is searched for (or, for Content,
 * a new one is drafted), and moves to "finishing" once a node has been picked for review and confirmation.
 * The process can be cancelled at any time. If an error occurs, an error message is added.
 *
 * The node's labels are not owned by this pipeline: they are fixed by the caller before the modal opens
 * and must not be changed while the process runs.
 *
 * @returns {UseAddNodeReturn} An object containing the necessary state variables and functions to control the pipeline.
 */
export function useAddNode(): UseAddNodeReturn {
  const node = ref<PickedNode | null>(null);

  const currentStep = ref<PipelineStep>("choosing");
  const errorMessages = ref<ErrorMessage[]>([]);
  const errorMessageCount = ref<number>(0);

  function addErrorMessage(): void {
    errorMessages.value.push({
      severity: "error",
      content: "An unknown error occurred.",
      id: errorMessageCount.value++,
    });
  }

  /**
   * Cancels import process. Resets the import pipeline to its initial state and clears all data and messages.
   *
   * @returns {void} This function does not return any value.
   */
  function cancel(): void {
    clearErrorMessages();
    setPipelineStep(null);
  }

  function clearErrorMessages(): void {
    errorMessageCount.value = 0;
    errorMessages.value = [];
  }

  /**
   * Finishes the import. Resets the import pipeline to its initial state after a successful import.
   *
   * @return {void} This function does not return any value.
   */
  function finish(): void {
    resetPipeline();
  }

  function resetPipeline(): void {
    setNode(null);
    setPipelineStep(null);
  }

  function setNode(newNode: PickedNode | null): void {
    node.value = newNode;
  }

  function setPipelineStep(step: PipelineStep): void {
    currentStep.value = step;
  }

  return {
    currentStep: readonly(currentStep),
    errorMessages: readonly(errorMessages),
    node,
    addErrorMessage,
    cancel,
    finish,
    setPipelineStep,
    setNode,
  };
}
