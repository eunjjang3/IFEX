interface IfexDesktopBridge {
  readonly isDesktop: true;
  readonly platform: 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32';
}

interface Window {
  readonly ifexDesktop?: IfexDesktopBridge;
}
