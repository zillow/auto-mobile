# Project Validation

This document provides instructions for AI agents to validate the Node TypeScript AutoMobile project
builds correctly and all tests pass. After writing some implementation you should select the most relevant checks given
the changes made. At no point should we be writing any JavaScript.

```bash
# Compile main source code
npm run build

# Run lint with automatic fixes - do this first before attempting to fix lint errors via editing  
npm run lint

# Run all tests
npm run test

# Run specific tests
npm run test -- --grep "Name of the test suite or test case"

```
