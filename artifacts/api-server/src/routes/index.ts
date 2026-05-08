import { Router, type IRouter } from "express";
import healthRouter from "./health";
import calculateRouter from "./calculate";
import formulasRouter from "./formulas";
import sessionsRouter from "./sessions";
import usersRouter from "./users";
import creditsRouter from "./credits";

const router: IRouter = Router();

router.use(healthRouter);
router.use(calculateRouter);
router.use("/formulas", formulasRouter);
router.use("/sessions", sessionsRouter);
router.use("/users", usersRouter);
router.use(creditsRouter);

export default router;
