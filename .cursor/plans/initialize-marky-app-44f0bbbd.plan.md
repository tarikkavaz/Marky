<!-- 44f0bbbd-7235-4ed2-b8c1-cdce15572c20 f05da879-b633-4f0f-a832-eec316920a17 -->
# Marky Development Plan - Phase Based

## Phase 1: Core UI & Editor Foundation
**Goal**: Create the basic editor interface with borderless black UI

### Tasks:
- Set up black borderless UI theme (dark mode, minimal design)
- Create basic Editor component with contenteditable div
- Implement basic text input and display
- Add window controls (close, minimize, maximize) since decorations are disabled
- Set up basic layout structure (header area, editor area, footer if needed)

**Deliverables**: 
- Working editor that accepts text input
- Black borderless window UI
- Basic window controls

---

## Phase 2: File Operations (Open/Save/Export)
**Goal**: Enable users to work with files

### Tasks:
- Implement Open file dialog using Tauri FS API
- Implement Save file dialog (new and existing files)
- Implement Save As functionality
- Create file format handler (plain text/Markdown)
- Implement Export to HTML functionality
- Add file state management (unsaved changes indicator)

**Deliverables**:
- Users can open, save, and export files
- File state tracking

---

## Phase 3: Basic Formatting & Live Preview
**Goal**: Show formatted text as you type (bold, italic, etc.)

### Tasks:
- Implement Markdown parsing (or lightweight markdown-like parsing)
- Create live preview renderer (bold shows as bold, italic as italic)
- Add basic formatting detection (**, *, etc.)
- Style formatted text appropriately
- Handle inline formatting (bold, italic, code)

**Deliverables**:
- Text formatting displays live as you type
- Basic markdown-like formatting works

---

## Phase 4: Toolbar & Formatting Controls
**Goal**: Add toggleable header toolbar for formatting

### Tasks:
- Create Toolbar component (toggleable visibility)
- Add formatting buttons (bold, italic, underline, headings)
- Implement image insertion button
- Implement table insertion button
- Add link insertion button
- Connect toolbar actions to editor
- Style toolbar to match black UI theme

**Deliverables**:
- Toggleable toolbar with formatting controls
- Can insert images, tables, links via toolbar

---

## Phase 5: Context Menu
**Goal**: Right-click menu for quick actions

### Tasks:
- Create ContextMenu component using shadcn dropdown-menu
- Add menu items:
  - Insert image
  - Insert table
  - Insert link
  - Separator
  - Correct grammar
  - Change style
- Implement context menu positioning (at cursor/selection)
- Connect menu actions to editor functions

**Deliverables**:
- Right-click context menu with insert and correction options

---

## Phase 6: Math Detection & Calculation
**Goal**: Detect and solve math expressions (4+5 ==)

### Tasks:
- Create Math.ts module in src/ai/
- Implement pattern detection for `==` trigger
- Parse mathematical expressions (4+5, 2*3, etc.)
- Evaluate math expressions safely
- Replace `expression ==` with `expression = result`
- Handle edge cases and errors

**Deliverables**:
- Math expressions ending with `==` are automatically solved

---

## Phase 7: Measurement Conversion
**Goal**: Convert measurements (length, weight, etc.)

### Tasks:
- Create Convert.ts module in src/ai/
- Implement measurement detection patterns
- Support common conversions:
  - Length (meters, feet, inches, cm, etc.)
  - Weight (kg, lbs, oz, etc.)
  - Temperature (Celsius, Fahrenheit)
  - Time (hours, minutes, seconds)
- Detect conversion requests (e.g., "5 feet to meters")
- Replace with converted value

**Deliverables**:
- Automatic measurement conversion

---

## Phase 8: Written-Form Calculations
**Goal**: Solve written-form math ("half of 1 hour ==")

### Tasks:
- Extend Math.ts to handle natural language
- Parse written expressions:
  - "half of X"
  - "X percent of Y"
  - "X times Y"
  - "X plus Y"
- Convert to mathematical expressions
- Evaluate and replace

**Deliverables**:
- Written-form calculations are solved automatically

---

## Phase 9: Grammar & Style Correction
**Goal**: One-click grammar and style correction

### Tasks:
- Create Grammar.ts module in src/ai/
- Integrate Vercel AI SDK (reference CorrectifySampleFiles)
- Implement grammar correction API call
- Implement style change API call
- Add correction for whole text
- Add correction for selected text only
- Show loading state during correction
- Handle API errors gracefully

**Deliverables**:
- Grammar correction works for whole or selected text
- Style changes work for whole or selected text

---

## Phase 10: Prompt Area
**Goal**: Toggleable prompt area for text interaction

### Tasks:
- Create PromptArea component (toggleable)
- Add text input for prompts
- Implement prompt submission
- Connect to AI/grammar services
- Show prompt history or results
- Style to match black UI theme

**Deliverables**:
- Toggleable prompt area for interacting with text

---

## Phase 11: Polish & Refinement
**Goal**: Final touches and optimizations

### Tasks:
- Add keyboard shortcuts
- Improve error handling
- Add loading states and feedback
- Optimize performance
- Test all features together
- Fix any bugs or edge cases
- Improve UI/UX based on usage

**Deliverables**:
- Polished, production-ready app

---

## Implementation Order Summary

1. **Phase 1**: Core UI & Editor Foundation
2. **Phase 2**: File Operations
3. **Phase 3**: Basic Formatting & Live Preview
4. **Phase 4**: Toolbar & Formatting Controls
5. **Phase 5**: Context Menu
6. **Phase 6**: Math Detection & Calculation
7. **Phase 7**: Measurement Conversion
8. **Phase 8**: Written-Form Calculations
9. **Phase 9**: Grammar & Style Correction
10. **Phase 10**: Prompt Area
11. **Phase 11**: Polish & Refinement

## Dependencies

- **CorrectifySampleFiles**: Reference for AI/grammar implementation (Vercel AI SDK)
- **shadcn/ui**: Already installed components (button, dialog, dropdown-menu, input, textarea)
- **Tauri FS API**: For file operations
- **Markdown parsing**: Consider using a lightweight library or custom parser

## Notes

- Each phase builds on previous phases
- Can test incrementally after each phase
- AI features (Phases 6-10) can reference CorrectifySampleFiles code
- UI should maintain simple black borderless theme throughout

### To-dos

- [ ] Set up black borderless UI theme and basic Editor component with contenteditable
- [ ] Add window controls (close, minimize) since decorations are disabled
- [ ] Implement Open/Save/Export using Tauri FS API
- [ ] Implement live preview with Markdown parsing and formatted text display
- [ ] Create toggleable toolbar with formatting buttons and insert options
- [ ] Implement right-click context menu with insert and correction options
- [ ] Create Math.ts module to detect and solve math expressions (4+5 ==)
- [ ] Create Convert.ts module for measurement conversions
- [ ] Extend Math.ts to handle written-form calculations (half of 1 hour ==)
- [ ] Create Grammar.ts module with Vercel AI SDK integration for correction
- [ ] Create toggleable prompt area component for text interaction
- [ ] Add keyboard shortcuts, error handling, loading states, and final polish