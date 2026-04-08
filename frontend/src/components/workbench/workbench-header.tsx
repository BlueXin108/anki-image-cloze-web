import React, {Suspense, lazy, memo, useEffect, useState} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	BookOpenTextIcon,
	CameraIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	DownloadIcon,
	EllipsisIcon,
	FolderUpIcon,
	ImageDownIcon,
	MessageCircleQuestionIcon,
	MonitorIcon,
	RefreshCcwIcon,
	RotateCcwIcon,
	SmartphoneIcon,
	Trash2Icon,
	UploadIcon,
	WorkflowIcon,
} from "lucide-react";

import type {WorkspaceMode} from "@/types";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {Spinner} from "@/components/ui/spinner";
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {InlineEmphasis} from "@/components/workbench/inline-emphasis";
import {cn} from "@/lib/utils";

const LazyAnkiConnectHelpPopover = lazy(async () => {
	const module = await import("@/components/workbench/anki-connect-help-popover");
	return {default: module.AnkiConnectHelpPopover};
});

export type WorkspaceGuideAction =
	| "upload"
	| "refresh-anki"
	| "open-export"
	| null;
type ManualGuideStep = "import" | "mask" | "anki" | "export";

interface ManualGuide {
	step: ManualGuideStep;
	hint: React.ReactNode;
	action: WorkspaceGuideAction;
	actionLabel: string | null;
}

interface WorkbenchHeaderProps {
	workspaceMode: WorkspaceMode;
	onWorkspaceModeChange: (mode: WorkspaceMode) => void;
	manualGuide: ManualGuide;
	loadingKey: string | null;
	onUploadImages: () => void;
	onCapturePhoto?: () => void;
	onImportFiles?: () => void;
	onImportFolder: () => void;
	onRestoreProject: () => void;
	onRefreshAnki: () => void;
	onOptimizeProject?: () => void;
	onClearProject: () => void;
	onExportDeckPoolBackup?: () => void;
	onImportDeckPoolBackup?: () => void;
	onGuideAction: (action: WorkspaceGuideAction) => void;
	showAnkiActions?: boolean;
	mobileOptimized?: boolean;
	ankiHelpOpen?: boolean;
	onAnkiHelpOpenChange?: (open: boolean) => void;
	onOpenAnkiHelp?: () => void;
	touchOptimized?: boolean;
	settingsAction?: React.ReactNode;
	showModeTabs?: boolean;
	projectCompressionState?: "original" | "compressed" | "mixed" | "none";
	projectCompressionCount?: number;
}

// --- 图标组件 ---

const AnkiIcon = memo(({className}: {className?: string}) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1em"
		height="1em"
		viewBox="0 0 48 48"
		className={className}>
		<path
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			d="m30.63 9.21l.735 3.685l3.452 1.482l-3.286 1.842l-.345 3.744l-2.76-2.554l-3.665.829l1.57-3.413l-1.921-3.237l3.734.442l2.476-2.828zM17.565 24.906l4.456 3.003l5.001-1.97l-1.482 5.168l3.413 4.144l-5.372.188l-2.886 4.534l-1.843-5.05l-5.197-1.346l4.232-3.306l-.328-5.362zM35.5 4.5h-23a4 4 0 0 0-4 4v31a4 4 0 0 0 4 4h23a4 4 0 0 0 4-4v-31a4 4 0 0 0-4-4"
			strokeWidth="2"
		/>
	</svg>
));

const MainIcon = memo(() => (
	<motion.div 
		layoutId="header-icon"
		className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/35 text-foreground"
	>
		<AnkiIcon className="size-6 text-foreground/80" />
	</motion.div>
));

// --- 静态数据提取 ---

const GUIDE_STEPS = [
	{step: "import" as const, label: "导入"},
	{step: "mask" as const, label: "挖空"},
	{step: "anki" as const, label: "Anki"},
	{step: "export" as const, label: "导出"},
];

// --- 全新的步骤条组件 (Stepper) ---
const GuideStepper = memo(function GuideStepper({
	currentGuideIndex,
	steps,
}: {
	currentGuideIndex: number;
	steps: Array<(typeof GUIDE_STEPS)[number]>;
}) {
	return (
		<div
			className="flex w-full items-center overflow-x-auto pb-1 sm:w-auto sm:pb-0"
			style={{scrollbarWidth: "none"}}>
			{steps.map((item, index) => {
				const isDone = index < currentGuideIndex;
				const isActive = index === currentGuideIndex;
				const isUpcoming = index > currentGuideIndex;

				return (
					<React.Fragment key={item.step}>
						{/* 单个步骤节点 */}
						<div
							className={cn(
								"flex shrink-0 items-center gap-2 transition-colors",
								isUpcoming ? "text-muted-foreground" : "text-foreground",
							)}>
							{/* 数字/打勾圆圈 */}
							<div
								className={cn(
									"flex size-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
									isActive &&
										"border-primary bg-primary text-primary-foreground shadow-sm",
									isDone && "border-primary bg-primary/10 text-primary",
									isUpcoming && "border-border/70 bg-muted/50",
								)}>
								{isDone ? (
									<CheckIcon className="size-3.5" strokeWidth={3} />
								) : (
									index + 1
								)}
							</div>
							{/* 步骤文字 */}
							<span
								className={cn(
									"text-sm font-medium",
									isActive && "text-primary",
								)}>
								{item.label}
							</span>
						</div>

						{/* 步骤间的连线 (最后一步不需要) */}
						{index < steps.length - 1 && (
							<div
								className={cn(
									"mx-2 h-[2px] w-4 shrink-0 rounded-full transition-colors sm:mx-3 sm:w-8",
									isDone ? "bg-primary/50" : "bg-border/60",
								)}
							/>
						)}
					</React.Fragment>
				);
			})}
		</div>
	);
});

// --- 主组件 ---

export const WorkbenchHeader = memo(function WorkbenchHeader({
	workspaceMode,
	onWorkspaceModeChange,
	manualGuide,
	loadingKey,
	onUploadImages,
	onCapturePhoto,
	onImportFiles,
	onImportFolder,
	onRestoreProject,
	onRefreshAnki,
	onOptimizeProject,
	onClearProject,
	onExportDeckPoolBackup,
	onImportDeckPoolBackup,
	onGuideAction: _onGuideAction,
	showAnkiActions = true,
	mobileOptimized = false,
	ankiHelpOpen,
	onAnkiHelpOpenChange,
	onOpenAnkiHelp,
	touchOptimized = false,
	settingsAction,
	showModeTabs = true,
	projectCompressionState = "none",
	projectCompressionCount = 0,
}: WorkbenchHeaderProps) {
	const [guideOpen, setGuideOpen] = useState(false);
	const [ankiHelpRequested, setAnkiHelpRequested] = useState(false);

	useEffect(() => {
		if (ankiHelpOpen) {
			setAnkiHelpRequested(true);
		}
	}, [ankiHelpOpen]);

	const guideOrder: ManualGuideStep[] = showAnkiActions
		? ["import", "mask", "anki", "export"]
		: ["import", "mask", "export"];
	const guideSteps = showAnkiActions
		? GUIDE_STEPS
		: GUIDE_STEPS.filter((item) => item.step !== "anki");
	const currentGuideIndex = Math.max(0, guideOrder.indexOf(manualGuide.step));
	const apkgHint = mobileOptimized
		? "会生成 APKG 卡包。下载后用 AnkiDroid 打开即可继续导入。"
		: "会生成 APKG 卡包。下载完成后直接拖进桌面版 Anki 即可手动导入。";
	const imageGroupHint = mobileOptimized
		? "会把每张卡的前后图打包成纯图像组，更适合最大兼容场景。"
		: "会把每张卡的前后图打包成纯图像组压缩包，适合最大兼容场景。";

	const headerDescription = mobileOptimized ? (
		<>
			手机端先导入图片，再进聚焦编辑画遮罩，最后生成
			<span className="mx-1 inline-flex">
				<InlineEmphasis hint={apkgHint} touchOptimized={touchOptimized}>
					APKG
				</InlineEmphasis>
			</span>
			或
			<span className="mx-1 inline-flex">
				<InlineEmphasis hint={imageGroupHint} touchOptimized={touchOptimized}>
					图像组
				</InlineEmphasis>
			</span>
			。
		</>
	) : (
		<>
			导入图片、绘制遮罩、检查预览，再通过
			<span className="mx-1 inline-flex">
				<InlineEmphasis onClick={onOpenAnkiHelp}>AnkiConnect</InlineEmphasis>
			</span>
			把卡片送进本机 Anki，或导出为
			<span className="mx-1 inline-flex">
				<InlineEmphasis hint={apkgHint} touchOptimized={touchOptimized}>
					APKG
				</InlineEmphasis>
			</span>
			/
			<span className="mx-1 inline-flex">
				<InlineEmphasis hint={imageGroupHint} touchOptimized={touchOptimized}>
					图像组
				</InlineEmphasis>
			</span>
			。
		</>
	);
	const pipelineDescription = mobileOptimized
		? "这里会放后续的自动处理功能。现在请先使用上面的手动处理流程。"
		: "这里会放后续的自动识别、建议遮罩和批量检查功能；当前版本先把手动处理体验做好。";
	const showLowerSection = workspaceMode === "pipeline" || guideOpen;
	const compressionHint =
		projectCompressionState === "original"
			? `当前项目还没压缩过${projectCompressionCount > 0 ? `，历史共压缩 ${projectCompressionCount} 次` : ""}`
			: projectCompressionState === "compressed"
				? `当前项目已压缩 ${projectCompressionCount} 次`
				: projectCompressionState === "mixed"
					? `当前项目里有的图片已压缩${projectCompressionCount > 0 ? `，累计 ${projectCompressionCount} 次` : ""}`
					: "当前还没有图片";
	const shouldHighlightOptimizeCurrent =
		projectCompressionState === "original";
	const compressionShortcut =
		projectCompressionState === "compressed"
			? `已压 ${projectCompressionCount} 次`
			: projectCompressionState === "original"
				? projectCompressionCount > 0
					? `曾压 ${projectCompressionCount} 次`
					: "推荐"
				: projectCompressionState === "mixed" && projectCompressionCount > 0
					? `${projectCompressionCount} 次`
					: "";

	return (
		<Card data-telemetry-section="header" className="overflow-hidden border-none bg-white/60 outline-0 ring-0 rounded-md">
			<CardContent className="px-4">
				<div
					className={cn(
						"relative flex flex-col gap-3 bg-muted/10 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5",
						showLowerSection && "border-b border-border/70",
					)}>
					<div className="flex items-start gap-3">
						<MainIcon />
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<motion.h3 
									layoutId="header-title"
									className="text-lg font-semibold tracking-tight md:text-lg text-foreground"
								>
									Anki-图像遮罩工具
								</motion.h3>
								<Tooltip>
									<TooltipTrigger asChild>
										<button type="button" className="cursor-help text-muted-foreground trs-all-400 hover:text-foreground">
											{mobileOptimized ? <SmartphoneIcon className="size-3.5" /> : <MonitorIcon className="size-3.5" />}
										</button>
									</TooltipTrigger>
									<TooltipContent side="right" sideOffset={8}>
										{mobileOptimized ? '当前是手机端，建议改到电脑端使用 AnkiConnect 获得更完整体验。' : '当前是电脑端，支持直接连接本机 Anki 读取牌组。'}
									</TooltipContent>
								</Tooltip>
								<div className="h-3 w-px bg-border/70" />
								{showAnkiActions ? (
									<>
										<Button
											size="sm"
											variant="ghost"
											className="h-8 rounded-xl px-2 text-muted-foreground hover:text-foreground"
											onClick={() => {
												setAnkiHelpRequested(true);
												if (onOpenAnkiHelp) onOpenAnkiHelp();
												else onAnkiHelpOpenChange?.(true);
											}}
										>
											<span className="font-medium text-current">Anki</span>
											<span className="ml-1 inline-flex items-center justify-center text-current">
												<MessageCircleQuestionIcon className="size-4" />
											</span>
										</Button>
										{ankiHelpRequested ? (
											<Suspense fallback={null}>
												<LazyAnkiConnectHelpPopover
													open={ankiHelpOpen}
													onOpenChange={onAnkiHelpOpenChange}
													compact
													showTrigger={false}
												/>
											</Suspense>
										) : null}
									</>
								) : null}
								{settingsAction}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											size="icon-sm"
											variant="ghost"
											className="trs-all-400 rounded-xl text-muted-foreground hover:-translate-y-0.5 hover:text-foreground active:scale-[0.97]">
											<EllipsisIcon />
											<span className="sr-only">更多</span>
										</Button>
									</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-56">
											<DropdownMenuLabel>更多操作</DropdownMenuLabel>
											<DropdownMenuGroup>
												<DropdownMenuItem onSelect={onRestoreProject}>
												{loadingKey === "restore-project" ? (
													<Spinner />
												) : (
													<RotateCcwIcon />
												)}
													恢复上次项目
												</DropdownMenuItem>
												<div className="px-2 pb-1 pt-1 text-[11px] leading-5 text-muted-foreground">
													{compressionHint}
												</div>
												<DropdownMenuItem
													onSelect={onOptimizeProject}
													disabled={!onOptimizeProject || projectCompressionState === "none"}
													className={cn(
														shouldHighlightOptimizeCurrent &&
															"bg-foreground/8 font-medium text-foreground focus:bg-foreground/12",
													)}
												>
													{loadingKey === "optimize-project" ? (
														<Spinner />
													) : (
														<ImageDownIcon />
													)}
													压缩当前所有图片
													<DropdownMenuShortcut>
														{compressionShortcut}
													</DropdownMenuShortcut>
												</DropdownMenuItem>
												{showAnkiActions ? (
													<DropdownMenuItem onSelect={onRefreshAnki}>
														{loadingKey === "refresh-anki" ? (
														<Spinner />
													) : (
														<RefreshCcwIcon />
													)}
													获取牌组
												</DropdownMenuItem>
											) : null}
										</DropdownMenuGroup>
										{mobileOptimized &&
										(onExportDeckPoolBackup || onImportDeckPoolBackup) ? (
											<>
												<DropdownMenuSeparator />
												<DropdownMenuGroup>
													{onExportDeckPoolBackup ? (
														<DropdownMenuItem onSelect={onExportDeckPoolBackup}>
															{loadingKey === "export-deck-pool" ? (
																<Spinner />
															) : (
																<DownloadIcon />
															)}
															导出牌组池备份
														</DropdownMenuItem>
													) : null}
													{onImportDeckPoolBackup ? (
														<DropdownMenuItem onSelect={onImportDeckPoolBackup}>
															{loadingKey === "import-deck-pool" ? (
																<Spinner />
															) : (
																<UploadIcon />
															)}
															导入牌组池备份
														</DropdownMenuItem>
													) : null}
												</DropdownMenuGroup>
											</>
										) : null}
										<DropdownMenuSeparator />
										<DropdownMenuItem
											variant="destructive"
											onSelect={onClearProject}>
											{loadingKey === "clear-project" ? (
												<Spinner />
											) : (
												<Trash2Icon />
											)}
											清空本地项目
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
							<CardDescription
								className={cn(
									"mt-0.5 text-xs",
									mobileOptimized ? "leading-5" : undefined,
								)}>
								{headerDescription}
							</CardDescription>
						</div>
					</div>

					<div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:max-w-[34rem]">
						{showModeTabs ? (
							<Tabs
								value={workspaceMode}
								onValueChange={(value) =>
									value && onWorkspaceModeChange(value as WorkspaceMode)
								}
								className="w-full sm:w-auto">
								<TabsList className="h-auto w-full gap-1.5 rounded-2xl bg-muted/60 p-1">
									<TabsTrigger
										value="manual"
										className="h-auto min-w-0 flex-1 justify-center gap-1.5 rounded-xl px-2.5 py-2 text-sm text-center">
										<BookOpenTextIcon className="size-4" />
										手动处理
									</TabsTrigger>
									<TabsTrigger
										value="pipeline"
										className="h-auto min-w-0 flex-1 justify-center gap-1.5 rounded-xl px-2.5 py-2 text-sm text-center">
										<WorkflowIcon className="size-4" />
										自动化流
									</TabsTrigger>
								</TabsList>
							</Tabs>
						) : null}

						{mobileOptimized ? (
							<div className="flex flex-col gap-2">
								<Button
									size="default"
									className="trs-all-400 h-10 min-w-0 rounded-xl px-3 sm:px-4 border border-transparent hover:-translate-y-0.5 active:scale-[0.98] hover:bg-background hover:text-primary hover:border-border"
									onClick={onUploadImages}>
									<UploadIcon className="size-4" data-icon="inline-start" />
									系统相册
								</Button>
								<div className={cn('grid gap-2', onCapturePhoto ? 'grid-cols-2' : 'grid-cols-1')}>
									{onCapturePhoto ? (
										<Button
											size="default"
											variant="secondary"
											className="trs-all-400 h-10 min-w-0 rounded-xl px-3 sm:px-4 border border-transparent text-muted-foreground hover:-translate-y-0.5 active:scale-[0.98] hover:bg-foreground hover:text-background hover:border-border"
											onClick={onCapturePhoto}>
											<CameraIcon className="size-4" data-icon="inline-start" />
											拍摄
										</Button>
									) : null}
									<Button
										size="default"
										variant="secondary"
										className="trs-all-400 h-10 min-w-0 rounded-xl px-3 sm:px-4 border border-transparent text-muted-foreground hover:-translate-y-0.5 active:scale-[0.98] hover:bg-foreground hover:text-background hover:border-border"
										onClick={onImportFiles ?? onUploadImages}>
										<FolderUpIcon className="size-4" data-icon="inline-start" />
										文件管理器
									</Button>
								</div>
							</div>
						) : (
							<div className="grid grid-cols-2 gap-2">
								<motion.div layoutId="btn-upload">
									<Button
										size="default"
										className="trs-all-400 h-10 w-full min-w-0 rounded-xl px-3 sm:px-4 border border-transparent hover:-translate-y-0.5 active:scale-[0.98] hover:bg-background hover:text-primary hover:border-border"
										onClick={onUploadImages}>
										<UploadIcon className="size-4" data-icon="inline-start" />
										上传图片
									</Button>
								</motion.div>
								<motion.div layoutId="btn-import-folder">
									<Button
										size="default"
										variant="secondary"
										className="trs-all-400 h-10 w-full min-w-0 rounded-xl px-3 sm:px-4 border border-transparent hover:-translate-y-0.5 active:scale-[0.98] hover:bg-foreground hover:text-background hover:border-border"
										onClick={onImportFolder}>
										<FolderUpIcon className="size-4" data-icon="inline-start" />
										导入文件夹
									</Button>
								</motion.div>
							</div>
						)}
					</div>

					{workspaceMode === "manual" && !guideOpen ? (
						<button
							type="button"
							aria-label="展开当前步骤"
							onClick={() => setGuideOpen(true)}
							className="trs-all-400 absolute left-1/2 -bottom-2 -translate-x-1/2 rounded-full bg-background/92 px-2 text-muted-foreground/70 hover:scale-105 hover:text-foreground active:scale-[0.94]"
						>
							<ChevronDownIcon className="size-3.5" />
						</button>
					) : null}
				</div>

				{workspaceMode === "manual" ? (
					<AnimatePresence initial={false}>
						{guideOpen && (
							<motion.div
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: 0.3, ease: "easeInOut" }}
								style={{ overflow: "hidden" }}
							>
								<div className="px-4 pb-4 md:px-4 md:pb-3">
									<div className="relative mt-3 flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
										<GuideStepper
											currentGuideIndex={currentGuideIndex}
											steps={guideSteps}
										/>
										<div className="flex items-center gap-2 text-xs text-muted-foreground">
											<MessageCircleQuestionIcon className="size-3.5 shrink-0" />
											<span>{manualGuide.hint}</span>
										</div>
										<button
											type="button"
											aria-label="折叠当前步骤"
											onClick={() => setGuideOpen(false)}
											className="trs-all-400 absolute left-1/2 -bottom-2 -translate-x-1/2 rounded-full bg-background/92 px-2 text-muted-foreground/70 hover:scale-105 hover:text-foreground active:scale-[0.94]"
										>
											<ChevronUpIcon className="size-3.5" />
										</button>
									</div>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				) : (
					<div className="grid gap-3 p-4 md:px-4 md:py-3">
						<div
							className={cn(
								"flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3 text-muted-foreground",
								mobileOptimized ? "text-xs" : "text-sm",
							)}>
							<Badge
								variant="outline"
								className="rounded-full bg-background/80">
								<WorkflowIcon className="size-3.5" />
								自动处理功能正在规划中
							</Badge>
							<span>{pipelineDescription}</span>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
});
