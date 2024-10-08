import type { Meta, StoryObj } from "storybook-solidjs";

import { Button } from "./Button";
import { ComponentProps, createSignal, For } from "solid-js";

const meta: Meta<typeof Button> = {
  component: Button,
};
export default meta;

type Story = StoryObj<typeof meta>;

type ButtonSize = ComponentProps<typeof Button>["size"];

export const _Button: Story = {
  render: () => {
    const [size, setSize] = createSignal<ButtonSize>("md");

    return (
      <>
        <label>Size</label>
        <select
          value={size()}
          onChange={(e) => setSize(e.target.value as ButtonSize)}
        >
          <For each={["xs", "sm", "md", "lg"]}>
            {(size) => <option value={size}>{size}</option>}
          </For>
        </select>
        <table class="border-spacing-2 border-separate text-sm text-left">
          <thead>
            <tr>
              <th />
              <th>Primary</th>
              <th>Secondary</th>
              <th>Destructive</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Default</th>
              <td>
                <Button variant="primary" size={size()}>
                  Button
                </Button>
              </td>
              <td>
                <Button variant="secondary" size={size()}>
                  Button
                </Button>
              </td>
              <td>
                <Button variant="destructive" size={size()}>
                  Button
                </Button>
              </td>
            </tr>
            <tr>
              <th>Hover</th>
              <td>
                <Button
                  variant="primary"
                  size={size()}
                  class="sb-pseudo--hover"
                >
                  Button
                </Button>
              </td>
              <td>
                <Button
                  variant="secondary"
                  size={size()}
                  class="sb-pseudo--hover"
                >
                  Button
                </Button>
              </td>
              <td>
                <Button
                  variant="destructive"
                  size={size()}
                  class="sb-pseudo--hover"
                >
                  Button
                </Button>
              </td>
            </tr>
            <tr>
              <th>Disabled</th>
              <td>
                <Button variant="primary" size={size()} disabled>
                  Button
                </Button>
              </td>
              <td>
                <Button variant="secondary" size={size()} disabled>
                  Button
                </Button>
              </td>
              <td>
                <Button variant="destructive" size={size()} disabled>
                  Button
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </>
    );
  },
};
