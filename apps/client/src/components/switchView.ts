/** Change de vue (lecteur ou admin) : tout l'écran se recharge. */
export const switchView = async (action: () => Promise<unknown>) => {
    await action();
    window.location.assign('/');
};
