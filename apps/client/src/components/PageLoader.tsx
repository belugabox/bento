import { Center, Loader } from '@mantine/core';

/** Chargement d'une page ou d'un bloc : centré, avec de l'air autour. */
export const PageLoader = () => (
    <Center py={48} w="100%" aria-busy="true">
        <Loader />
    </Center>
);
