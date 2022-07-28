export default function sleep(milliseconds): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
