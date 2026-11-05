<script setup lang="ts">
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import { useGuidelinesStore } from "../store/guidelines";
import { useShortcutsStore } from "../store/shortcuts";
import Button from "primevue/button";
import SplitButton from "primevue/splitbutton";
import { ComponentPublicInstance, onMounted, useTemplateRef } from "vue";
import { resolveAnnotationIcon } from "../config/icons";
import { getOptions, getShapeConfig, type ModelAnnotationShape, type ModelAttribute } from "../utils/helper/modelHelper";

const props = defineProps<{
  type: string;
  disabled: boolean;
  /** The annotation shape of the type */
  shape: ModelAnnotationShape;
}>();

const emit = defineEmits<(e: "clicked", data: { type: string; subType?: string | number }) => void>();

const { getTextAnnotationProperties, getModelContext } = useGuidelinesStore();
const { registerShortcut } = useShortcutsStore();

const fields: ModelAttribute[] = getTextAnnotationProperties(props.type);
const subTypeField: ModelAttribute | undefined = fields.find((field) => field.attribute.name === "subType");
const options: string[] | number[] = subTypeField ? (getOptions(getModelContext(), subTypeField) ?? []) : [];
const dropdownOptions = options.map((option: string | number) => {
  return {
    label: option.toString(),
    command: () => handleDropdownClick(option),
  };
});

const hasIcon: boolean = resolveAnnotationIcon(props.shape) !== undefined;
const buttonElm = useTemplateRef<ComponentPublicInstance<typeof Button | typeof SplitButton>>("buttonElm");

const shortcut: string | undefined = getShapeConfig(props.shape)?.controls?.shortcut;

if (shortcut) {
  registerShortcut(shortcut, handleClick);
}

// TODO: This is a temporary hack since PrimeVue makes problems with accessing the component's
// DOM element with the pcButton/pcDropdown pt option...fix maybe later, but works for now
onMounted(setButtonStylingManually);

function setButtonStylingManually(): void {
  // SplitButton has its flaws: Dropdown button and annotation button can not be accessed (wait for Primevue update),
  // therefore the DOM element need to be queried and styled manually. this is done via the subTypeField variable
  const rootElm: HTMLElement | undefined = buttonElm.value?.$el;

  if (subTypeField && rootElm) {
    const dropdownButton: HTMLButtonElement | null = rootElm.querySelector(".p-splitbutton-dropdown");
    const mainButton: HTMLButtonElement | null = rootElm.querySelector(".p-splitbutton-button");

    if (dropdownButton) {
      dropdownButton.style.width = "15px";
    }

    if (mainButton) {
      mainButton.style.width = "35px";
      mainButton.style.paddingLeft = "5px";
      mainButton.style.paddingRight = "5px";
    }

    // When there is no icon AND the annotation has a SplitButton component, the width is set to 'auto'
    // with the tailwind utility class 'w-auto'.
    if (!hasIcon) {
      const splitButtonElm: HTMLButtonElement | null = rootElm.querySelector("button.p-splitbutton-button");

      splitButtonElm?.classList.add("w-auto");
    }
  }
}

function handleDropdownClick(subType: string | number): void {
  handleClick(subType);
}

function handleButtonClick(): void {
  handleClick();
}

function handleClick(dropdownOption?: string | number): void {
  emit("clicked", { type: props.type, subType: dropdownOption });
}
</script>

<template>
  <Button
    v-if="!subTypeField"
    ref="buttonElm"
    v-tooltip.hover.top="{ value: props.type, showDelay: 50 }"
    severity="secondary"
    outlined
    raised
    :style="{ height: '35px', width: '35px' }"
    :class="hasIcon ? '' : 'button-empty'"
    :disabled="disabled"
    :data-annotation-type="props.type"
    @click="handleButtonClick"
  >
    <template #icon>
      <AnnotationTypeIcon v-if="hasIcon" :shape="props.shape" />
    </template>
    <template #default>
      <span v-if="!hasIcon"> {{ props.type }} </span>
    </template>
  </Button>
  <SplitButton
    v-else
    ref="buttonElm"
    v-tooltip.hover.top="{ value: props.type, showDelay: 50 }"
    dropdown-icon="icon-chevron-down"
    severity="secondary"
    outlined
    raised
    :style="{ height: '35px' }"
    :class="hasIcon ? '' : 'w-auto'"
    :model="dropdownOptions"
    :disabled="disabled"
    :pt="{
      pcMenu: {
        root: {
          style: {
            zIndex: 'var(--z-index-max)',
          },
        },
      },
    }"
    @click="handleButtonClick"
  >
    <template #icon>
      <AnnotationTypeIcon :shape="props.shape" />
    </template>
    <template #default>
      <span v-if="!hasIcon"> {{ props.type }} </span>
    </template>

    <template #item="{ label }">
      <div class="flex p-1 gap-1 items-center select-none cursor-pointer">
        <span :style="{ display: 'block', width: '20px', height: '20px' }">
          <AnnotationTypeIcon :shape="props.shape" />
        </span>
        <span>{{ label }}</span>
      </div>
    </template>
  </SplitButton>
</template>

<style scoped>
.button-empty {
  padding: 0 5px;
  width: auto !important;
}
</style>
