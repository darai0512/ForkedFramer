export type ObjectUrlHandle = ReturnType<typeof createObjectUrlManager>;

export function createObjectUrlManager() {
  const urls: string[] = [];

  function register(url: string) {
    urls.push(url);
  }

  function release(url?: string | null) {
    if (!url) return;
    let index = urls.indexOf(url);
    let removed = false;
    while (index !== -1) {
      urls.splice(index, 1);
      removed = true;
      index = urls.indexOf(url);
    }
    if (!removed) return;
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.warn('Failed to revoke object URL', error);
    }
  }

  function revokeAll() {
    for (const url of urls) {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('Failed to revoke object URL', error);
      }
    }
    urls.length = 0;
  }

  return {
    register,
    release,
    revokeAll,
  };
}
