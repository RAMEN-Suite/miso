import { Router, createWebHistory, createRouter } from "vue-router";
import EditorView from "./views/EditorView.vue";
import HierarchyView from "./views/HierarchyView.vue";
import CollectionSingleView from "./views/CollectionSingleView.vue";
import NotFound from "./views/NotFound.vue";
import { useNavigationGuard } from "./composables/useNavigationGuard";

const { hasOpenModal } = useNavigationGuard();

const allRoutes = [
  { path: "/", component: HierarchyView, meta: { layout: "default" as const } },
  {
    path: "/collections/:uuid",
    component: CollectionSingleView,
    props: true,
    meta: { layout: "default" as const },
  },
  { path: "/contents/:uuid", component: EditorView, meta: { layout: "default" as const }, alias: ["/texts/:uuid"] },
  // Dev only: `import.meta.env.DEV` is replaced with `false` in production builds, so the dynamic import is removed and
  // no playground chunk is emitted
  ...(import.meta.env.DEV
    ? [{ path: "/playground", component: () => import("./views/PlaygroundView.vue"), meta: { layout: "default" as const } }]
    : []),
  { path: "/:pathMatch(.*)*", component: NotFound, meta: { layout: "blank" as const } },
];

const router: Router = createRouter({
  history: createWebHistory(),
  routes: allRoutes,
});

router.beforeEach(() => hasOpenModal());

export default router;
