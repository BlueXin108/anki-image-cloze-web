import {
	memo,
	startTransition,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {createPortal} from "react-dom";
import {
	ImageIcon,
	ImageDownIcon,
	Loader2Icon,
	SquarePenIcon,
	ZoomInIcon,
	CropIcon,
} from "lucide-react";
import {motion, AnimatePresence} from "framer-motion";

import {ImageEditor} from "@/components/editor/image-editor";
import {FocusEditorDialog} from "@/components/workbench/focus-editor-dialog";
import {Button} from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@/components/ui/empty";
import {Kbd} from "@/components/ui/kbd";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Skeleton} from "@/components/ui/skeleton";
import {countGeneratedCards} from "@/lib/card-generation";
import {groupMasksByCard, renderDraftPreviewSet} from "@/lib/manual-preview";
import {cn} from "@/lib/utils";
import type {
	CardDraft,
	CardGenerationMode,
	DraftListItem,
	ManualPreviewSet,
	WorkbenchSettings,
} from "@/types";

interface ManualWorkspaceProps {
	selectedItem: DraftListItem | null;
	onMasksCommit: (masks: CardDraft["masks"]) => Promise<void>;
	onCropCommit: (bbox: [number, number, number, number]) => Promise<void>;
	focusShortcutEnabled?: boolean;
	onEditorHoverChange?: (hovered: boolean) => void;
	readOnlyInWorkspace?: boolean;
	touchOptimized?: boolean;
	onPreviousItem?: () => void;
	onNextItem?: () => void;
	canGoPrevious?: boolean;
	canGoNext?: boolean;
	isGlobalDragActive?: boolean;
	generationMode?: CardGenerationMode;
	onFocusModeChange?: (open: boolean) => void;
	shortcutOverlayReady?: boolean;
	modernFloatingToolbar?: boolean;
	workbenchSettings: WorkbenchSettings;
	onWorkbenchSettingsChange: (settings: WorkbenchSettings) => void;
}

// 提取你提供的完整快捷键清单
const EDITOR_SHORTCUTS = [
	{key: "Alt + 拖动", action: "新建遮罩"},
	{key: "A / D", action: "切换图片"},
	{key: "Ctrl + 点击", action: "多选"},
	{key: "Ctrl + A", action: "全选"},
	{key: "1-9", action: "快速选中"},
	{key: "Tab", action: "合并/拆分卡片"},
	{key: "中键", action: "拖线重排序号"},
	{key: "Ctrl + Z/Y", action: "撤回重做"},
	{key: "V", action: "显隐遮罩"},
	{key: "R", action: "显隐 OCR"},
	{key: "E", action: "删除选中"},
];

const PREVIEW_PANEL_HEIGHT_CLASS = "h-[320px] sm:h-[360px] lg:h-[380px]";

const PreviewPanel = memo(function PreviewPanel({
	title,
	description,
	imageUrl,
	loading,
	emptyTitle,
	emptyDescription,
	onOpen,
	onImageLoadedChange,
	alt,
	touchOptimized,
}: {
	title: string;
	description: string;
	imageUrl: string | null;
	loading: boolean;
	emptyTitle: string;
	emptyDescription: string;
	onOpen: () => void;
	onImageLoadedChange: (loaded: boolean) => void;
	alt: string;
	touchOptimized: boolean;
}) {
	const [displayedImageUrl, setDisplayedImageUrl] = useState<string | null>(
		imageUrl,
	);
	const [isSwitchingImage, setIsSwitchingImage] = useState(false);
	const showImage = Boolean(displayedImageUrl);

	useEffect(() => {
		if (!imageUrl) {
			setDisplayedImageUrl(null);
			setIsSwitchingImage(false);
			return;
		}
		if (imageUrl === displayedImageUrl) {
			return;
		}

		let cancelled = false;
		const next = new Image();
		setIsSwitchingImage(true);
		next.onload = () => {
			if (cancelled) return;
			setDisplayedImageUrl(imageUrl);
			setIsSwitchingImage(false);
			onImageLoadedChange(true);
		};
		next.onerror = () => {
			if (cancelled) return;
			setDisplayedImageUrl(imageUrl);
			setIsSwitchingImage(false);
			onImageLoadedChange(true);
		};
		next.src = imageUrl;

		return () => {
			cancelled = true;
		};
	}, [displayedImageUrl, imageUrl, onImageLoadedChange]);

	return (
		<Card className="border-border/70 bg-background/80">
			<CardHeader className={cn(touchOptimized && "pb-2")}>
				<CardTitle className={cn(touchOptimized && "text-[14px]")}>
					{title}
				</CardTitle>
				{!touchOptimized ? (
					<CardDescription>{description}</CardDescription>
				) : null}
			</CardHeader>
			<CardContent className="min-h-[260px]">
				<div
					className={cn(
						"relative w-full rounded-xl overflow-hidden",
						PREVIEW_PANEL_HEIGHT_CLASS,
					)}>
					<AnimatePresence>
						{showImage ? (
							<motion.button
								key={displayedImageUrl}
								initial={{opacity: 0}}
								animate={{opacity: 1}}
								exit={{opacity: 0}}
								transition={{duration: 0.22, ease: "easeInOut"}}
								type="button"
								onClick={onOpen}
								className="absolute inset-0 z-10 flex w-full items-center justify-center border border-border bg-muted/20 text-left trs-all-400 hover:border-primary/40">
								<img
									src={displayedImageUrl ?? undefined}
									alt={alt}
									loading="lazy"
									decoding="async"
									className="h-full w-full cursor-zoom-in object-contain"
									onLoad={() => onImageLoadedChange(true)}
									onError={() => onImageLoadedChange(true)}
								/>
								{loading || isSwitchingImage ? (
									<div className="pointer-events-none absolute right-3 top-3 rounded-full border border-border/70 bg-background/92 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
										正在更新预览
									</div>
								) : null}
							</motion.button>
						) : loading ? (
							<motion.div
								key="loading"
								initial={{opacity: 0}}
								animate={{opacity: 1}}
								exit={{opacity: 0}}
								transition={{duration: 0.3, ease: "easeInOut"}}
								className="absolute inset-0 z-[5] flex flex-col justify-center gap-3 bg-background">
								<Skeleton className="h-5 w-28 rounded-full" />
								<Skeleton className="h-full w-full rounded-2xl" />
							</motion.div>
						) : (
							<motion.div
								key="empty"
								initial={{opacity: 0}}
								animate={{opacity: 1}}
								exit={{opacity: 0}}
								transition={{duration: 0.3, ease: "easeInOut"}}
								className="absolute inset-0 z-0 bg-background">
								<Empty className="h-full border-border bg-muted/30">
									<EmptyHeader>
										<EmptyTitle>{emptyTitle}</EmptyTitle>
										<EmptyDescription>{emptyDescription}</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</CardContent>
		</Card>
	);
});

export const ManualWorkspace = memo(function ManualWorkspace({
	selectedItem,
	onMasksCommit,
	onCropCommit,
	focusShortcutEnabled = true,
	onEditorHoverChange,
	readOnlyInWorkspace = false,
	touchOptimized = false,
	onPreviousItem,
	onNextItem,
	canGoPrevious = false,
	canGoNext = false,
	isGlobalDragActive = false,
	generationMode = "hide-all-reveal-current",
	onFocusModeChange,
	shortcutOverlayReady = true,
	modernFloatingToolbar,
	workbenchSettings,
	onWorkbenchSettingsChange,
}: ManualWorkspaceProps) {
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewTitle, setPreviewTitle] = useState("");
	const [previewDescription, setPreviewDescription] = useState("");
	const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
	const [focusMode, setFocusMode] = useState(false);
	const [previewGroupId, setPreviewGroupId] = useState<string | null>(null);
	const [previewSet, setPreviewSet] = useState<ManualPreviewSet>({
		frontUrl: null,
		backUrl: null,
	});
	const [previewLoading, setPreviewLoading] = useState(false);

	// Hover 状态控制与 Portal 挂载状态
	const [isEditorHovered, setIsEditorHovered] = useState(false);
	const [shortcutOverlayVisible, setShortcutOverlayVisible] = useState(false);
	const [mounted, setMounted] = useState(false);
	const focusModeInitializedRef = useRef(false);

	// 确保 Portal 仅在客户端渲染挂载
	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		onEditorHoverChange?.(
			!touchOptimized &&
				isEditorHovered &&
				!focusMode &&
				shortcutOverlayVisible,
		);
	}, [
		focusMode,
		isEditorHovered,
		onEditorHoverChange,
		shortcutOverlayVisible,
		touchOptimized,
	]);

	useEffect(() => {
		if (touchOptimized || !shortcutOverlayReady || focusMode) {
			setShortcutOverlayVisible(false);
			return;
		}

		const timer = window.setTimeout(() => {
			setShortcutOverlayVisible(true);
		}, 1500);

		return () => {
			window.clearTimeout(timer);
			setShortcutOverlayVisible(false);
		};
	}, [focusMode, shortcutOverlayReady, touchOptimized]);

	useEffect(() => {
		if (!focusModeInitializedRef.current) {
			focusModeInitializedRef.current = true;
			return;
		}
		onFocusModeChange?.(focusMode);
	}, [focusMode, onFocusModeChange]);

	const groupedCardMasks = useMemo(
		() => (selectedItem ? groupMasksByCard(selectedItem.draft.masks) : []),
		[selectedItem],
	);
	const deferredSelectedItem = useDeferredValue(selectedItem);
	const deferredPreviewGroupId = useDeferredValue(previewGroupId);

	useEffect(() => {
		if (!focusShortcutEnabled) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "q") return;
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				target.closest('input, textarea, [contenteditable="true"]')
			) {
				return;
			}
			event.preventDefault();
			setFocusMode((current) => !current);
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [focusShortcutEnabled]);

	useEffect(() => {
		if (!selectedItem) {
			setPreviewGroupId(null);
			setPreviewSet({frontUrl: null, backUrl: null});
			return;
		}

		const firstGroupId =
			groupMasksByCard(selectedItem.draft.masks)[0]?.groupId ?? null;
		setPreviewGroupId((current) => {
			if (
				current &&
				groupedCardMasks.some((group) => group.groupId === current)
			) {
				return current;
			}
			return firstGroupId;
		});
	}, [groupedCardMasks, selectedItem]);

	useEffect(() => {
		let cancelled = false;
		if (!deferredSelectedItem?.image.source_url) {
			setPreviewSet({frontUrl: null, backUrl: null});
			setPreviewLoading(false);
			return;
		}

		setPreviewLoading(true);
		void renderDraftPreviewSet({
			draft: deferredSelectedItem.draft,
			sourceUrl: deferredSelectedItem.image.source_url,
			imageWidth: deferredSelectedItem.image.width,
			imageHeight: deferredSelectedItem.image.height,
			selectedGroupId: deferredPreviewGroupId,
			generationMode,
		})
			.then((next) => {
				if (!cancelled) {
					startTransition(() => {
						setPreviewSet(next);
					});
				}
			})
			.catch(() => {
				if (!cancelled) {
					setPreviewSet({frontUrl: null, backUrl: null});
				}
			})
			.finally(() => {
				if (!cancelled) {
					setPreviewLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [deferredPreviewGroupId, deferredSelectedItem, generationMode]);

	if (!selectedItem) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<Empty
					className={cn(
						"max-w-xl trs-all-400",
						isGlobalDragActive
							? "border-4 border-primary/50 bg-primary/5 scale-110 h-[50%]"
							: "border-2 border-border border-dashed bg-muted/20 h-[35%]",
					)}>
					<EmptyHeader>
						<div className="mb-4 flex flex-col items-center justify-center text-muted-foreground/60">
							{isGlobalDragActive ? (
								<ImageDownIcon className="size-20 text-primary trs-all-400" />
							) : (
								<ImageIcon className="size-14 trs-all-400" />
							)}
						</div>
						{isGlobalDragActive ? (
							<>
								<EmptyTitle>松手后导入</EmptyTitle>
								<EmptyDescription>
									支持拖入单张、多张图片或整个文件夹
								</EmptyDescription>
							</>
						) : (
							<>
								<EmptyTitle>等待导入图片</EmptyTitle>
								<EmptyDescription>
									{touchOptimized
										? "先从顶部上传图片或导入文件夹，然后在上方图片区选一张图继续。"
										: "先从顶部上传图片或导入文件夹，然后在左侧选一张图开始编辑。"}
								</EmptyDescription>
							</>
						)}
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const expectedCardCount = countGeneratedCards(
		selectedItem.draft,
		generationMode,
	);
	const selectedItemPreparing = selectedItem.image.status === "preparing";

	const openPreview = (
		title: string,
		description: string,
		imageUrl: string | null,
	) => {
		if (!imageUrl) return;
		setPreviewTitle(title);
		setPreviewDescription(description);
		setPreviewImageUrl(imageUrl);
		setPreviewOpen(true);
	};

	const renderEditor = (mode: "normal" | "focus") => (
		<div
			className={cn(
				"relative w-full transition-[transform,box-shadow,filter] duration-300 brightness-95",
				!touchOptimized &&
					isEditorHovered &&
					!focusMode &&
					"z-10 brightness-100  drop-shadow-[10px_0px_2px_rgba(24,18,8,0.04)]",
			)}>
			<AnimatePresence mode="wait" initial={false}>
				
				<motion.div
					layoutId={`editor-view-${selectedItem.draft.id}`}
					key={`manual-${mode}-${selectedItem.draft.id}`}
					initial={{opacity: 0, scale: 0.98}}
					animate={{opacity: 1, scale: 1}}
					exit={{opacity: 0, scale: 0.98}}
					transition={{duration: 0.35, ease: [0, 0.43, 0, 0.99]}}
					className="w-full h-full relative">
						<div className={cn("absolute top-0 right-0 z-100 h-0 w-full flex justify-end overflow-visible",touchOptimized&&"hidden",)}>
							<Button
								variant={touchOptimized ? "ghost" : "outline"}
								size={touchOptimized ? "default" : "sm"}
								className={cn(
									"shadow-none outline-none border-none",
									// 使用 translate-y-[-100%] 让按钮向上偏移出父容器边界，
									// 或者根据需要调整 top 值（如 top-2 right-2）
									"translate-y-2 -translate-x-2", 
									touchOptimized ? "h-11 w-full shadow-md" : "bg-white/0 backdrop-blur-sm",
								)}
								onClick={() => setFocusMode(true)}
							>
								{touchOptimized ? (
									<SquarePenIcon data-icon="inline-start" />
								) : (
									<ZoomInIcon data-icon="inline-start" />
								)}
								{readOnlyInWorkspace ? "进入聚焦编辑" : "聚焦编辑（Q）"}
							</Button>
						</div>
					<ImageEditor
						draft={selectedItem.draft}
						sourceImageUrl={selectedItem.image.source_url || ""}
						imageWidth={selectedItem.image.width}
						imageHeight={selectedItem.image.height}
						onMasksCommit={onMasksCommit}
						onCropCommit={onCropCommit}
						showOcrTools={false}
						showCropSubmit={false}
						imageClassName={
							mode === "focus"
								? "max-h-[calc(90vh-9rem)] max-w-full"
								: undefined
						}
						focusLayout={false}
						hideMetaBar
						readOnly={readOnlyInWorkspace && mode === "normal"}
						disableWheelResize={touchOptimized}
						touchOptimized={touchOptimized && mode === "focus"}
						onPreviousItem={onPreviousItem}
						onNextItem={onNextItem}
						canGoPrevious={canGoPrevious}
						canGoNext={canGoNext}
						onImageHoverChange={(hovered) => {
							if (!touchOptimized && mode === "normal")
								setIsEditorHovered(hovered);
						}}
						allowLongPressDelete={workbenchSettings.mobileLongPressDeleteMask}
					/>
				</motion.div>
			</AnimatePresence>
		</div>
	);

	return (
    //快捷键overlay
		<div
			data-telemetry-section="workspace"
			className={cn(
				"flex h-full flex-col overflow-hidden",
				touchOptimized ? "p-2" : "p-4",
			)}>
			{/* 核心修复：利用 createPortal 将元素直接注入 document.body。
        彻底规避 ScrollArea 中的 transform 属性造成的 fixed 失效问题。
      */}

			{mounted &&
				!touchOptimized &&
				createPortal(
					<div
						className={cn(
							// 1. 定位与整体布局：固定在屏幕左侧，占满高度，改为顶对齐 (items-start)
							// px-6 控制整体左侧间距，pt-10 控制顶部间距
							"pointer-events-none fixed inset-y-0 left-0 z-[99999] flex flex-col items-start pt-20 px-15 trs-all-400",
							// 2. 渐变背景：从左到右 (to-r)，由白变透明。
							// pr-24 控制白色渐变背景的宽度，确保其涵盖最长的文字
							"bg-gradient-to-r from-white/100 via-white/98 pr-50 to-transparent",
							// 3. 动画状态：改为横向位移 (translate-x)
							isEditorHovered && !focusMode && shortcutOverlayVisible
								? "translate-x-0 opacity-100"
								: "-translate-x-6 opacity-0",
						)}>
						{/* 1. 第一层：文字提示与横线（移到上方作为列表标题） */}
						<div className="flex w-full flex-col items-start mb-4">
							<div className="text-[12px] font-semibold tracking-wide text-zinc-800">
								编辑快捷键
							</div>
							{/* max-w-[80px] 限制横线宽度，在左侧更精致 */}
							<div className="mt-1.5 h-px w-full max-w-[80px] bg-zinc-200" />
						</div>

						{/* 2. 第二层：快捷键列表（独立的纵向 Flex 容器） */}
						{/* gap-y-3 控制列表项之间的行距 */}
						<div className="flex flex-col items-start gap-y-3">
							{EDITOR_SHORTCUTS.map((sc, idx) => (
								<div
									key={idx}
									// py-0.5 增加微小的点击/视觉区域
									className="flex items-center gap-2.5 text-xs font-bold py-0.5">
									{/* 统一 Kbd 的外层容器，保证 Kbd 宽度不齐时文字依然对齐 */}
									<div className="flex w-20 justify-end">
										<Kbd>{sc.key}</Kbd>
									</div>
									<span className="text-zinc-700 font-medium">{sc.action}</span>
								</div>
							))}
						</div>

						<div className="mt-8 text-xs text-gray-400/90">
							鼠标移出编辑区域以关闭侧栏
						</div>
					</div>,
					document.body,
				)}

			{!focusMode ? (
				<ScrollArea className="h-full pr-3">
					<div className="flex flex-col gap-4 px-2 pb-4">
						<Card className="border-border/70 bg-background/80 py-0 pb-2 ring-0">
							<CardHeader
								className={cn(
									//桌面端隐藏
									"gap-3 pt-4 transition-[opacity,filter] duration-200 border-b-[0.8px] border-border/70","flex sm:hidden",
									!touchOptimized &&
										isEditorHovered &&
										"opacity-60 saturate-75",
								)}>
								<div className="flex flex-col flex-wrap w-full items-start justify-between gap-3">
									<div className="space-y-1 flex-1 min-w-0 text-[12px]">
										<CardTitle
											className={cn(
												"text-[14px]",
												touchOptimized && "text-[14px]",
											)}>
											图像编辑
										</CardTitle>
										{!touchOptimized && !selectedItemPreparing ? (
											<CardDescription className="text-[12px]">
												{readOnlyInWorkspace
													? "当前页先只做预览，进入聚焦编辑后再拖动遮罩，能更稳地避开移动端误触。"
													: "你可以在这里直接完成裁剪、遮罩、分组和制卡预览，整个过程都在当前浏览器里完成。"}
											</CardDescription>
										) : null}
										{readOnlyInWorkspace && !selectedItemPreparing ? (
											<div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-0.5">
												常规页仅供预览全图，请进入聚焦编辑操作
											</div>
										) : null}
										{selectedItemPreparing ? (
											<CardDescription>
												这张图还在后台转换中。转换完成后会自动开放编辑，不用重新导入
											</CardDescription>
										) : null}
									</div>

									{!selectedItemPreparing ? (
										<div className="flex justify-center items-center w-full">
											<Button
												variant={touchOptimized ? "default" : "outline"}
												size={touchOptimized ? "default" : "sm"}
												className={cn(
													"shadow-none outline-none border-none ",
													touchOptimized ? "h-11 w-full w-max-full" : undefined,
												)}
												onClick={() => setFocusMode(true)}>
												{touchOptimized ? (
													<SquarePenIcon data-icon="inline-start" />
												) : (
													<ZoomInIcon data-icon="inline-start" />
												)}
												{readOnlyInWorkspace ? "进入聚焦编辑" : "聚焦编辑（Q）"}
											</Button>
										</div>
									) : null}
								</div>
							</CardHeader>
							<CardContent
								className={cn(
									"flex flex-col",
									touchOptimized ? "gap-2" : "gap-3",
								)}>
									
								{selectedItemPreparing ? (
									<div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
										<div className="flex max-w-sm flex-col items-center gap-3 text-sm text-muted-foreground">
											<div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/90 text-foreground/70">
												<Loader2Icon className="size-5 animate-spin" />
											</div>
											<div className="space-y-1">
												<div className="font-medium text-foreground/85">
													正在转换 HEIF 图片
												</div>
												<div>
													会先按照当前设置转成可编辑图片，完成后再开放裁切、遮罩和聚焦编辑。
												</div>
											</div>
										</div>
									</div>
									
								) : (
									renderEditor("normal")
								)}
							</CardContent>
						</Card>

						{/* 以下保持原有的预览布局 */}
						{!selectedItemPreparing ? (
							<Card
								className={cn(
									"border-border/70 bg-background/80 transition-[opacity,filter] duration-200",
									!touchOptimized &&
										isEditorHovered &&
										"opacity-45 saturate-75",
								)}>
								<CardHeader>
									<CardTitle className={cn(touchOptimized && "text-[14px]")}>
										预览当前卡片分组
									</CardTitle>
									<CardDescription
										className={cn("text-[11px]", touchOptimized && "text-[10px]")}>
										点下面的小色块，切换问题和答案的预览。
									</CardDescription>
								</CardHeader>
								<CardContent>
									{groupedCardMasks.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{groupedCardMasks.map((group, index) => {
												const isCombined = group.masks.length > 1;
												const isActive = group.groupId === previewGroupId;
												return (
													<motion.button
														key={group.groupId}
														type="button"
														onClick={() => setPreviewGroupId(group.groupId)}
														className={cn(
															"relative inline-flex h-11 overflow-hidden rounded-md border text-sm shadow-sm transition-colors duration-200",
															isActive
																? "border-transparent text-white"
																: "border-black/20 bg-white text-black hover:border-black/50 hover:bg-muted/30",
														)}>
														{isActive && (
															<motion.div
																layoutId="activeMaskGroupBackground"
																className="absolute inset-0 z-0 bg-black"
																initial={false}
																transition={{
																	type: "spring",
																	bounce: 0.15,
																	duration: 0.5,
																}}
															/>
														)}
														<span
															className={cn(
																"relative z-10 flex h-full items-center px-4 font-semibold tracking-[0.02em]",
																isCombined ? "pr-3" : "pr-4",
															)}>
															挖空{index + 1}
														</span>
														{isCombined && (
															<span
																className={cn(
																	"relative z-10 flex h-full items-center justify-center border-l px-2 text-[11px] font-medium leading-tight transition-colors duration-200",
																	isActive
																		? "border-white/20 text-white"
																		: "border-black/20 text-white bg-black",
																)}
																title="这一组遮罩会合并成一张卡">
																组<br />合
															</span>
														)}
													</motion.button>
												);
											})}
										</div>
									) : (
										<Empty className="border-border bg-muted/20">
											<EmptyHeader className="items-center text-center">
												<div className="flex size-14 items-center justify-center rounded-2xl  bg-background/90 text-foreground/70 ">
													<CropIcon className="size-7" />
												</div>
												<EmptyTitle className="text-sm">还没有遮罩</EmptyTitle>
												<EmptyDescription className="text-[11px] leading-5">
													先画出至少一个遮罩，页面才会生成对应的卡片预览。
												</EmptyDescription>
											</EmptyHeader>
										</Empty>
									)}
								</CardContent>
							</Card>
						) : null}

						{!selectedItemPreparing && groupedCardMasks.length > 0 ? (
							<div
								className={cn(
									"grid gap-4 xl:grid-cols-2 transition-[opacity,filter] duration-200",
									!touchOptimized &&
										isEditorHovered &&
										"opacity-45 saturate-75",
								)}>
								<PreviewPanel
									title="问题面预览"
									description={
										generationMode === "hide-current-only"
											? "当前模式下，题面只会遮住你选中的这一组。"
											: generationMode === "single-card-toggle"
												? "当前模式会生成一张可点击的整图卡；这里先用静态图预览全部遮罩的位置。"
												: "会按照当前选中的卡片分组，把这组遮罩高亮出来。"
									}
									imageUrl={previewSet.frontUrl}
									loading={previewLoading}
									emptyTitle="还没有预览"
									emptyDescription="画出遮罩后，这里会立刻显示当前卡片的问题面。"
									onOpen={() =>
										openPreview(
											"问题面预览",
											"点击放大查看当前问题面。",
											previewSet.frontUrl,
										)
									}
									onImageLoadedChange={() => {}}
									alt="Front preview"
									touchOptimized={touchOptimized}
								/>

								<PreviewPanel
									title="答案面预览"
									description={
										generationMode === "hide-current-only"
											? "当前模式下，答案面会把全部内容都显示出来。"
											: generationMode === "single-card-toggle"
												? "真正复习时可以直接点遮罩查看或重新盖回去；这里展示的是静态落地效果。"
												: "答案面会保留当前卡片本身的答案区域，并继续隐藏其他组的遮罩。"
									}
									imageUrl={previewSet.backUrl}
									loading={previewLoading}
									emptyTitle="还没有预览"
									emptyDescription="当前还没有可展示的答案面效果。"
									onOpen={() =>
										openPreview(
											"答案面预览",
											"点击放大查看当前答案面。",
											previewSet.backUrl,
										)
									}
									onImageLoadedChange={() => {}}
									alt="Back preview"
									touchOptimized={touchOptimized}
								/>
							</div>
						) : null}
					</div>
				</ScrollArea>
			) : null}

			<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
				<DialogContent className="sm:max-w-5xl">
					<DialogHeader>
						<DialogTitle>{previewTitle}</DialogTitle>
						<DialogDescription>{previewDescription}</DialogDescription>
					</DialogHeader>
					<div className="overflow-hidden rounded-2xl border border-border/60 bg-muted/20">
						{previewImageUrl ? (
							<img
								src={previewImageUrl}
								alt={previewTitle}
								className="max-h-[75vh] w-full object-contain"
							/>
						) : null}
					</div>
				</DialogContent>
			</Dialog>

			<FocusEditorDialog
				open={focusMode}
				onOpenChange={setFocusMode}
				item={selectedItem}
				cardCount={expectedCardCount}
				onMasksCommit={onMasksCommit}
				onCropCommit={onCropCommit}
				onPreviousItem={onPreviousItem}
				onNextItem={onNextItem}
				canGoPrevious={canGoPrevious}
				canGoNext={canGoNext}
				previousLabel=""
				nextLabel=""
				touchOptimized={touchOptimized}
				disableWheelResize={touchOptimized}
				modernFloatingToolbar={modernFloatingToolbar}
				workbenchSettings={workbenchSettings}
				onWorkbenchSettingsChange={onWorkbenchSettingsChange}
			/>
		</div>
	);
});
