import { Button } from "@cap/ui-solid";
import { trackDeep } from "@solid-primitives/deep";
import { throttle } from "@solid-primitives/scheduled";
import { useSearchParams } from "@solidjs/router";
import {
  For,
  Match,
  Show,
  Switch,
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  on,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { createMutation } from "@tanstack/solid-query";
import { createEventListenerMap } from "@solid-primitives/event-listener";
import { convertFileSrc } from "@tauri-apps/api/core";

import { events } from "~/utils/tauri";
import {
  EditorContextProvider,
  EditorInstanceContextProvider,
  FPS,
  OUTPUT_SIZE,
  useEditorContext,
  useEditorInstanceContext,
} from "./context";
import {
  Dialog,
  DialogContent,
  EditorButton,
  Input,
  Subfield,
  Toggle,
} from "./ui";
import { Header } from "./Header";
import { Player } from "./Player";
import { ConfigSidebar } from "./ConfigSidebar";
import { Timeline } from "./Timeline";

export function Editor() {
  const [params] = useSearchParams<{ id: string }>();

  return (
    <Show when={params.id} fallback="No video id available" keyed>
      {(videoId) => (
        <EditorInstanceContextProvider videoId={videoId}>
          <Show
            when={(() => {
              const ctx = useEditorInstanceContext();
              const editorInstance = ctx.editorInstance();
              const presets = ctx.presets.query();

              if (!editorInstance || !presets) return;
              return { editorInstance, presets };
            })()}
          >
            {(values) => (
              <EditorContextProvider {...values()}>
                <Inner />
              </EditorContextProvider>
            )}
          </Show>
        </EditorInstanceContextProvider>
      )}
    </Show>
  );
}

function Inner() {
  const { project, playbackTime, setPlaybackTime, playing, previewTime } =
    useEditorContext();

  onMount(() => {
    events.editorStateChanged.listen((e) => {
      renderFrame.clear();
      setPlaybackTime(e.payload.playhead_position / FPS);
    });
  });

  const renderFrame = throttle((time: number) => {
    events.renderFrameEvent.emit({
      frame_number: Math.max(Math.floor(time * FPS), 0),
      fps: FPS,
      resolution_base: OUTPUT_SIZE,
    });
  }, 1000 / 60);

  const frameNumberToRender = createMemo(() => {
    const preview = previewTime();
    if (preview !== undefined) return preview;
    return playbackTime();
  });

  createEffect(
    on(frameNumberToRender, (number) => {
      if (playing()) return;
      renderFrame(number);
    })
  );

  createEffect(
    on(
      () => {
        trackDeep(project);
      },
      () => {
        renderFrame(playbackTime());
      }
    )
  );

  return (
    <div class="w-screen h-screen flex flex-col">
      <Header />
      <div
        class="p-5 pt-0 flex-1 w-full overflow-y-hidden flex flex-col gap-4 bg-gray-50 leading-5 animate-in fade-in"
        data-tauri-drag-region
      >
        <div class="rounded-2xl overflow-hidden  shadow border flex-1 flex flex-col divide-y bg-white">
          <div class="flex flex-row flex-1 divide-x overflow-y-hidden">
            <Player />
            <ConfigSidebar />
          </div>
          <Timeline />
        </div>
        <Dialogs />
      </div>
    </div>
  );
}

function Dialogs() {
  const { dialog, setDialog, presets, project } = useEditorContext();

  return (
    <Dialog.Root
      size={(() => {
        const d = dialog();
        if ("type" in d && d.type === "crop") return "lg";
        return "sm";
      })()}
      open={dialog().open}
      onOpenChange={(o) => {
        if (!o) setDialog((d) => ({ ...d, open: false }));
      }}
    >
      <Show
        when={(() => {
          const d = dialog();
          if ("type" in d) return d;
        })()}
      >
        {(dialog) => (
          <Switch>
            <Match when={dialog().type === "createPreset"}>
              {(_) => {
                const [form, setForm] = createStore({
                  name: "",
                  default: false,
                });

                const createPreset = createMutation(() => ({
                  mutationFn: async () => {
                    await presets.createPreset({ ...form, config: project });
                  },
                  onSuccess: () => {
                    setDialog((d) => ({ ...d, open: false }));
                  },
                }));

                return (
                  <DialogContent
                    title="Create Preset"
                    confirm={
                      <Dialog.ConfirmButton
                        disabled={createPreset.isPending}
                        onClick={() => createPreset.mutate()}
                      >
                        Create
                      </Dialog.ConfirmButton>
                    }
                  >
                    <Subfield name="Name" required />
                    <Input
                      class="mt-[0.25rem]"
                      value={form.name}
                      onInput={(e) => setForm("name", e.currentTarget.value)}
                    />
                    <Subfield name="Set as default" class="mt-[0.75rem]">
                      <Toggle
                        checked={form.default}
                        onChange={(checked) => setForm("default", checked)}
                      />
                    </Subfield>
                  </DialogContent>
                );
              }}
            </Match>
            <Match
              when={(() => {
                const d = dialog();
                if (d.type === "renamePreset") return d;
              })()}
            >
              {(dialog) => {
                const [name, setName] = createSignal(
                  presets.query()?.presets[dialog().presetIndex].name!
                );

                const renamePreset = createMutation(() => ({
                  mutationFn: async () =>
                    presets.renamePreset(dialog().presetIndex, name()),
                  onSuccess: () => {
                    setDialog((d) => ({ ...d, open: false }));
                  },
                }));

                return (
                  <DialogContent
                    title="Rename Preset"
                    confirm={
                      <Dialog.ConfirmButton
                        disabled={renamePreset.isPending}
                        onClick={() => renamePreset.mutate()}
                      >
                        Rename
                      </Dialog.ConfirmButton>
                    }
                  >
                    <Subfield name="Name" required />
                    <Input
                      value={name()}
                      onInput={(e) => setName(e.currentTarget.value)}
                    />
                  </DialogContent>
                );
              }}
            </Match>
            <Match
              when={(() => {
                const d = dialog();
                if (d.type === "deletePreset") return d;
              })()}
            >
              {(dialog) => {
                const deletePreset = createMutation(() => ({
                  mutationFn: async () =>
                    presets.deletePreset(dialog().presetIndex),
                  onSuccess: () => {
                    setDialog((d) => ({ ...d, open: false }));
                  },
                }));

                return (
                  <DialogContent
                    title="Delete Preset"
                    confirm={
                      <Dialog.ConfirmButton
                        variant="destructive"
                        onClick={() => deletePreset.mutate()}
                        disabled={deletePreset.isPending}
                      >
                        Delete
                      </Dialog.ConfirmButton>
                    }
                  >
                    <p class="text-gray-400">
                      Are you sure you want to delete this preset?
                    </p>
                  </DialogContent>
                );
              }}
            </Match>
            <Match
              when={(() => {
                const d = dialog();
                if (d.type === "crop") return d;
              })()}
            >
              {(dialog) => {
                const { setProject: setState, editorInstance } =
                  useEditorContext();
                const [crop, setCrop] = createStore({
                  position: dialog().position,
                  size: dialog().size,
                });

                const display = editorInstance.recordings.segments[0].display;

                const styles = createMemo(() => {
                  return {
                    left: `${(crop.position.x / display.width) * 100}%`,
                    top: `${(crop.position.y / display.height) * 100}%`,
                    right: `calc(${
                      ((display.width - crop.size.x - crop.position.x) /
                        display.width) *
                      100
                    }%)`,
                    bottom: `calc(${
                      ((display.height - crop.size.y - crop.position.y) /
                        display.height) *
                      100
                    }%)`,
                  };
                });

                let cropAreaRef!: HTMLDivElement;
                let cropTargetRef!: HTMLDivElement;

                return (
                  <>
                    <Dialog.Header>
                      <div class="flex flex-row space-x-[0.75rem]">
                        {/*<AspectRatioSelect />*/}
                        <div class="flex flex-row items-center space-x-[0.5rem] text-gray-400">
                          <span>Size</span>
                          <div class="w-[3.25rem]">
                            <Input value={crop.size.x} disabled />
                          </div>
                          <span>x</span>
                          <div class="w-[3.25rem]">
                            <Input value={crop.size.y} disabled />
                          </div>
                        </div>
                        <div class="flex flex-row items-center space-x-[0.5rem] text-gray-400">
                          <span>Position</span>
                          <div class="w-[3.25rem]">
                            <Input value={crop.position.x} disabled />
                          </div>
                          <span>x</span>
                          <div class="w-[3.25rem]">
                            <Input
                              class="w-[3.25rem]"
                              value={crop.position.y}
                              disabled
                            />
                          </div>
                        </div>
                      </div>
                      <EditorButton
                        leftIcon={<IconCapCircleX />}
                        class="ml-auto"
                        onClick={() =>
                          setCrop({
                            position: { x: 0, y: 0 },
                            size: {
                              x: display.width,
                              y: display.height,
                            },
                          })
                        }
                      >
                        Reset
                      </EditorButton>
                    </Dialog.Header>
                    <Dialog.Content>
                      <div class="flex flex-row justify-center">
                        <div class="relative bg-blue-200" ref={cropAreaRef}>
                          <div class="divide-black-transparent-10 overflow-hidden rounded-lg">
                            <img
                              class="shadow pointer-events-none max-h-[70vh]"
                              alt="screenshot"
                              src={convertFileSrc(
                                `${editorInstance.path}/screenshots/display.jpg`
                              )}
                            />
                          </div>
                          <div
                            class="bg-white-transparent-20 absolute cursor-move"
                            ref={cropTargetRef}
                            style={styles()}
                            onMouseDown={(downEvent) => {
                              const original = {
                                position: { ...crop.position },
                                size: { ...crop.size },
                              };

                              createRoot((dispose) => {
                                createEventListenerMap(window, {
                                  mouseup: () => dispose(),
                                  mousemove: (moveEvent) => {
                                    const diff = {
                                      x:
                                        ((moveEvent.clientX -
                                          downEvent.clientX) /
                                          cropAreaRef.clientWidth) *
                                        display.width,
                                      y:
                                        ((moveEvent.clientY -
                                          downEvent.clientY) /
                                          cropAreaRef.clientHeight) *
                                        display.height,
                                    };

                                    const x = Math.floor(
                                      (() => {
                                        if (original.position.x + diff.x < 0)
                                          return 0;
                                        if (
                                          original.position.x + diff.x >
                                          display.width - crop.size.x
                                        )
                                          return display.width - crop.size.x;

                                        return original.position.x + diff.x;
                                      })()
                                    );

                                    const y = Math.floor(
                                      (() => {
                                        if (original.position.y + diff.y < 0)
                                          return 0;
                                        if (
                                          original.position.y + diff.y >
                                          display.height - crop.size.y
                                        )
                                          return display.height - crop.size.y;

                                        return original.position.y + diff.y;
                                      })()
                                    );

                                    setCrop("position", { x, y });
                                  },
                                });
                              });
                            }}
                          >
                            <For
                              each={Array.from({ length: 4 }, (_, i) => ({
                                x: i < 2 ? ("l" as const) : ("r" as const),
                                y:
                                  i % 2 === 0 ? ("t" as const) : ("b" as const),
                              }))}
                            >
                              {(pos) => {
                                const behaviours = {
                                  x:
                                    pos.x === "l"
                                      ? ("both" as const)
                                      : ("resize" as const),
                                  y:
                                    pos.y === "t"
                                      ? ("both" as const)
                                      : ("resize" as const),
                                };

                                return (
                                  <button
                                    type="button"
                                    class="absolute"
                                    style={{
                                      ...(pos.x === "l"
                                        ? { left: "0px" }
                                        : { right: "0px" }),
                                      ...(pos.y === "t"
                                        ? { top: "0px" }
                                        : { bottom: "0px" }),
                                    }}
                                    onMouseDown={(downEvent) => {
                                      downEvent.stopPropagation();

                                      const original = {
                                        position: { ...crop.position },
                                        size: { ...crop.size },
                                      };

                                      const MIN_SIZE = 100;

                                      createRoot((dispose) => {
                                        createEventListenerMap(window, {
                                          mouseup: () => dispose(),
                                          mousemove: (moveEvent) => {
                                            batch(() => {
                                              const diff = {
                                                x:
                                                  ((moveEvent.clientX -
                                                    downEvent.clientX) /
                                                    cropAreaRef.clientWidth) *
                                                  display.width,
                                                y:
                                                  ((moveEvent.clientY -
                                                    downEvent.clientY) /
                                                    cropAreaRef.clientHeight) *
                                                  display.height,
                                              };

                                              if (behaviours.x === "resize") {
                                                setCrop(
                                                  "size",
                                                  "x",
                                                  Math.floor(
                                                    clamp(
                                                      original.size.x + diff.x,
                                                      MIN_SIZE,
                                                      display.width -
                                                        crop.position.x
                                                    )
                                                  )
                                                );
                                              } else {
                                                setCrop(
                                                  "position",
                                                  "x",
                                                  Math.floor(
                                                    clamp(
                                                      original.position.x +
                                                        diff.x,
                                                      0,
                                                      display.width - MIN_SIZE
                                                    )
                                                  )
                                                );
                                                setCrop(
                                                  "size",
                                                  "x",
                                                  Math.floor(
                                                    clamp(
                                                      original.size.x - diff.x,
                                                      MIN_SIZE,
                                                      display.width
                                                    )
                                                  )
                                                );
                                              }

                                              if (behaviours.y === "resize") {
                                                setCrop(
                                                  "size",
                                                  "y",
                                                  Math.floor(
                                                    clamp(
                                                      original.size.y + diff.y,
                                                      MIN_SIZE,
                                                      display.height -
                                                        crop.position.y
                                                    )
                                                  )
                                                );
                                              } else {
                                                setCrop(
                                                  "position",
                                                  "y",
                                                  Math.floor(
                                                    clamp(
                                                      original.position.y +
                                                        diff.y,
                                                      0,
                                                      display.height - MIN_SIZE
                                                    )
                                                  )
                                                );
                                                setCrop(
                                                  "size",
                                                  "y",
                                                  Math.floor(
                                                    clamp(
                                                      original.size.y - diff.y,
                                                      MIN_SIZE,
                                                      display.height
                                                    )
                                                  )
                                                );
                                              }
                                            });
                                          },
                                        });
                                      });
                                    }}
                                  >
                                    <div class="size-[1rem] bg-gray-500 border border-gray-50 rounded-full absolute -top-[0.5rem] -left-[0.5rem]" />
                                  </button>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      </div>
                    </Dialog.Content>
                    <Dialog.Footer>
                      <Button
                        onClick={() => {
                          setState("background", "crop", crop);
                          setDialog((d) => ({ ...d, open: false }));
                        }}
                      >
                        Save
                      </Button>
                    </Dialog.Footer>
                  </>
                );
              }}
            </Match>
          </Switch>
        )}
      </Show>
    </Dialog.Root>
  );
}

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}
