export function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
    </svg>
  );
}

export function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 510"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M268.26,43.23c29.51,29.51,44.26,68.36,44.26,107.17,0,27.52-7.42,55.07-22.26,79.28l220.71,220.71-58.51,58.51-29.26-29.26-31.32,31.32-37.81-37.8,31.33-31.33-9.61-9.61-46.36,46.36-41.01-41.01,46.36-46.36-103.06-103.06c-24.16,14.74-51.69,22.12-79.26,22.12v.17c-38.81,0-77.66-14.75-107.16-44.26C15.79,236.68,1.03,197.83,1.03,159.02S15.79,81.36,45.29,51.86l8.63-8.63C83.43,13.72,122.28-1.03,161.09-1.03v.17c38.92,0,77.78,14.7,107.17,44.09ZM208.07,103.43c-12.99-12.99-30.02-19.49-46.98-19.49v.17c-17.06,0-34.1,6.44-46.97,19.31l-8.63,8.63c-12.88,12.88-19.32,29.91-19.32,46.97s6.44,34.1,19.32,46.98c12.88,12.88,29.91,19.32,46.97,19.32v.17c16.96,0,33.99-6.5,46.98-19.48l8.63-8.63c12.87-12.87,19.31-29.91,19.31-46.97s-6.44-34.1-19.31-46.97Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 10V7a6 6 0 1 1 12 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1zm2 0h8V7a4 4 0 0 0-8 0v3z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

export function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 12h14m-5-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
