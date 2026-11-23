import { calculate } from './calculate.mjs';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: calculate(data) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
