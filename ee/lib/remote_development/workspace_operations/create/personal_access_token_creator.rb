# frozen_string_literal: true

module RemoteDevelopment
  module WorkspaceOperations
    module Create
      class PersonalAccessTokenCreator
        include Messages

        # @param [Hash] context
        # @return [Gitlab::Fp::Result]
        def self.create(context)
          context => {
            user: User => user,
            workspace_name: String => workspace_name,
            params: Hash => params
          }
          params => {
            project: Project => project
          }

          # TODO: Use PAT service injection - https://gitlab.com/gitlab-org/gitlab/-/issues/423415
          personal_access_token = user.personal_access_tokens.build(
            name: workspace_name,
            impersonation: false,
            scopes: [:write_repository, :api],
            organization: project.organization,
            expires_at: max_allowed_personal_access_token_expires_at,
            description: "Generated automatically for this workspace. " \
              "Revoking this token will make your workspace completely unusable."
          )
          personal_access_token.save

          if personal_access_token.errors.present?
            return Gitlab::Fp::Result.err(
              PersonalAccessTokenModelCreateFailed.new(
                { errors: personal_access_token.errors, context: context }
              )
            )
          end

          Gitlab::Fp::Result.ok(
            context.merge({
              personal_access_token: personal_access_token
            })
          )
        end

        # @return [ActiveSupport::TimeWithZone]
        def self.max_allowed_personal_access_token_expires_at
          MaxHoursBeforeTermination::MAX_HOURS_BEFORE_TERMINATION.hours.from_now.to_date.next_day - 1.second
        end
        private_class_method :max_allowed_personal_access_token_expires_at
      end
    end
  end
end
