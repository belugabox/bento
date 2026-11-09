import { Avatar, type AvatarProps } from '@mantine/core';

import { avatarUrl } from '@/services/api';

/** Avatar Clay d'un compte, ou ses initiales s'il n'en a pas choisi. */
export const UserAvatar = ({
    name,
    seed,
    ...props
}: { name: string; seed: string | null } & Omit<AvatarProps, 'src'>) => (
    <Avatar
        src={seed ? avatarUrl(seed) : null}
        name={name}
        alt={name}
        color="initials"
        {...props}
    />
);
