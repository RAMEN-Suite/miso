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
  { path: "/:pathMatch(.*)*", component: NotFound, meta: { layout: "blank" as const } },
];

const prodRoutes = allRoutes.filter((r) => !["/test", "/playground"].includes(r.path));

const usedRoutes = import.meta.env.DEV ? allRoutes : prodRoutes;

const router: Router = createRouter({
  history: createWebHistory(),
  routes: usedRoutes,
});

router.beforeEach(() => hasOpenModal());

export default router;
